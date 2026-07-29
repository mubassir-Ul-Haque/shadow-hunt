// Zero-Dependency Modern Node.js HTTP & WebSocket Server for Shadow Hunt
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { RoomManager } from './server/RoomManager.js';
import { GameLoop } from './server/GameLoop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const roomManager = new RoomManager();
const sockets = new Map(); // socketId -> wsConnection

// Mime types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

// Standard HTTP Static File Server
const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];
  if (reqUrl === '/') reqUrl = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, reqUrl));

  // Security check: stay inside public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

// RFC-6455 WebSocket Handshake & Frame Handling
server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade']?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const clientKey = req.headers['sec-websocket-key'];
  if (!clientKey) {
    socket.destroy();
    return;
  }

  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const acceptKey = crypto.createHash('sha1').update(clientKey + GUID).digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  const socketId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const ws = new WSWrapper(socket, socketId);
  sockets.set(socketId, ws);

  ws.send({ type: 'CONNECTED', socketId });

  socket.on('data', (buffer) => {
    ws.handleData(buffer);
  });

  socket.on('close', () => {
    handleDisconnect(socketId);
  });

  socket.on('error', (err) => {
    console.error(`Socket error [${socketId}]:`, err.message);
    socket.destroy();
  });
});

// WebSocket Wrapper Class
class WSWrapper {
  constructor(rawSocket, socketId) {
    this.socket = rawSocket;
    this.id = socketId;
    this.buffer = Buffer.alloc(0);
  }

  send(dataObj) {
    try {
      const jsonStr = JSON.stringify(dataObj);
      const payload = Buffer.from(jsonStr, 'utf-8');
      const len = payload.length;

      let header;
      if (len <= 125) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + Text frame
        header[1] = len;
      } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
      }

      this.socket.write(Buffer.concat([header, payload]));
    } catch (e) {
      console.error(`Failed to send WS message to ${this.id}:`, e);
    }
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLen = secondByte & 0x7f;

      let offset = 2;
      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKeys = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) return;
        maskKeys = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) return; // Wait for full frame

      const rawPayload = this.buffer.slice(offset, offset + payloadLen);
      this.buffer = this.buffer.slice(offset + payloadLen);

      if (opcode === 0x8) {
        // Connection Close
        this.socket.destroy();
        return;
      }

      if (opcode === 0x9) {
        // Ping -> Reply Pong
        this.sendPong();
        continue;
      }

      if (opcode === 0x1) {
        // Text Frame
        if (isMasked && maskKeys) {
          for (let i = 0; i < rawPayload.length; i++) {
            rawPayload[i] ^= maskKeys[i % 4];
          }
        }
        try {
          const msg = JSON.parse(rawPayload.toString('utf-8'));
          handleMessage(this.id, msg);
        } catch (e) {
          console.error(`JSON Parse error from [${this.id}]:`, e);
        }
      }
    }
  }

  sendPong() {
    const pongFrame = Buffer.from([0x8a, 0x00]);
    this.socket.write(pongFrame);
  }
}

// Router for Client Messages
function handleMessage(socketId, msg) {
  const ws = sockets.get(socketId);
  if (!ws) return;

  switch (msg.type) {
    case 'CREATE_ROOM': {
      const room = roomManager.createRoom(socketId, msg.playerName, msg.settings);
      broadcastRoomUpdate(room);
      ws.send({
        type: 'ROOM_CREATED',
        room: roomManager.getCleanRoomState(room),
        playerId: socketId
      });
      break;
    }

    case 'JOIN_ROOM': {
      const roomCode = msg.roomCode?.toUpperCase();
      const res = roomManager.addPlayerToRoom(roomCode, socketId, msg.playerName);

      if (res.error) {
        ws.send({ type: 'ERROR', message: res.error });
      } else {
        ws.send({
          type: 'ROOM_JOINED',
          room: roomManager.getCleanRoomState(res.room),
          playerId: socketId
        });
        broadcastRoomUpdate(res.room);
      }
      break;
    }

    case 'TOGGLE_READY': {
      const res = roomManager.toggleReady(socketId);
      if (res) {
        broadcastRoomUpdate(res.room);
      }
      break;
    }

    case 'UPDATE_SETTINGS': {
      const room = roomManager.updateSettings(socketId, msg.settings);
      if (room) {
        broadcastRoomUpdate(room);
      }
      break;
    }

    case 'KICK_PLAYER': {
      const res = roomManager.kickPlayer(socketId, msg.targetSocketId);
      if (res) {
        const kickedWs = sockets.get(msg.targetSocketId);
        if (kickedWs) {
          kickedWs.send({ type: 'KICKED', reason: 'You were kicked by the room host.' });
        }
        broadcastRoomUpdate(res.room);
      }
      break;
    }

    case 'START_GAME': {
      const room = roomManager.getRoomByPlayerId(socketId);
      if (room && room.hostId === socketId && room.state === 'LOBBY') {
        // Verify min players or bot auto-fill
        const activePlayersCount = room.players.size;
        if (activePlayersCount < room.settings.minPlayers && !room.settings.botFillEnabled) {
          ws.send({
            type: 'ERROR',
            message: `Minimum ${room.settings.minPlayers} players required to start!`
          });
          return;
        }

        // Initialize 60Hz Game Loop
        room.gameLoop = new GameLoop(room, (gameMsg) => {
          broadcastToRoom(room.code, gameMsg);
        });

        room.gameLoop.start();
        broadcastRoomUpdate(room);
      }
      break;
    }

    case 'INPUT': {
      const room = roomManager.getRoomByPlayerId(socketId);
      if (room && room.gameLoop && room.state === 'PLAYING') {
        room.gameLoop.processPlayerInput(socketId, msg.input);
      }
      break;
    }

    case 'RETURN_TO_LOBBY': {
      const room = roomManager.getRoomByPlayerId(socketId);
      if (room && room.hostId === socketId) {
        if (room.gameLoop) room.gameLoop.stop();
        room.state = 'LOBBY';
        // Reset ready status
        for (const p of room.players.values()) {
          p.isReady = p.isHost;
          p.role = 'SURVIVOR';
          p.isAlive = true;
        }
        broadcastRoomUpdate(room);
      }
      break;
    }

    case 'PING': {
      ws.send({ type: 'PONG', clientTime: msg.clientTime, serverTime: Date.now() });
      break;
    }

    default:
      console.log(`Unknown message type: ${msg.type}`);
  }
}

function handleDisconnect(socketId) {
  sockets.delete(socketId);
  const result = roomManager.removePlayer(socketId);
  if (result && !result.roomEmpty && result.room) {
    broadcastRoomUpdate(result.room);
  }
}

function broadcastRoomUpdate(room) {
  if (!room) return;
  const cleanState = roomManager.getCleanRoomState(room);
  broadcastToRoom(room.code, {
    type: 'ROOM_UPDATE',
    room: cleanState
  });
}

function broadcastToRoom(roomCode, dataObj) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  for (const socketId of room.players.keys()) {
    const ws = sockets.get(socketId);
    if (ws) {
      ws.send(dataObj);
    }
  }
}

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SHADOW HUNT - Multiplayer 2D Survival Maze Server`);
  console.log(`  Server running live at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
