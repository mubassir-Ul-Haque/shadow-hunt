// Modular Room Manager for Shadow Hunt
// Handles lobby creation, room code generation, host migration, ready states, and settings.

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SH-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  createRoom(hostSocketId, hostName, settings = {}) {
    const roomCode = this.generateRoomCode();
    const defaultSettings = {
      roundTime: 180, // seconds
      maxPlayers: 8,
      minPlayers: 2,
      movementSpeed: 1.0,
      killerSpeedBonus: 1.15,
      powerupsEnabled: true,
      friendlyMode: false,
      botFillEnabled: false,
      ...settings
    };

    const room = {
      code: roomCode,
      hostId: hostSocketId,
      state: 'LOBBY', // 'LOBBY' | 'PLAYING' | 'FINISHED'
      settings: defaultSettings,
      players: new Map(), // socketId -> playerObj
      gameLoop: null,
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);

    // Add host as first player
    this.addPlayerToRoom(roomCode, hostSocketId, hostName || 'Player 1');

    return room;
  }

  addPlayerToRoom(roomCode, socketId, playerName, isBot = false) {
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };

    if (room.state !== 'LOBBY' && !isBot) {
      return { error: 'Game is already in progress' };
    }

    if (room.players.size >= room.settings.maxPlayers) {
      return { error: 'Room is full' };
    }

    const isHost = room.players.size === 0 || room.hostId === socketId;
    if (isHost) room.hostId = socketId;

    const player = {
      id: socketId,
      name: playerName || `Player ${room.players.size + 1}`,
      isHost,
      isReady: isHost, // Host is ready by default
      isBot,
      role: 'SURVIVOR', // 'KILLER' | 'SURVIVOR' | 'SPECTATOR'
      isAlive: true,
      score: 0,
      kills: 0,
      survivalTime: 0,
      color: '#00E5FF',
      powerup: null,
      powerupTimer: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0
    };

    room.players.set(socketId, player);
    return { room, player };
  }

  removePlayer(socketId) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        room.players.delete(socketId);

        // Host migration if host left
        if (room.hostId === socketId && room.players.size > 0) {
          const nextPlayerId = Array.from(room.players.keys())[0];
          room.hostId = nextPlayerId;
          const nextPlayer = room.players.get(nextPlayerId);
          if (nextPlayer) {
            nextPlayer.isHost = true;
            nextPlayer.isReady = true;
          }
        }

        // Clean up room if empty
        if (room.players.size === 0) {
          if (room.gameLoop) room.gameLoop.stop();
          this.rooms.delete(code);
          return { roomCode: code, roomEmpty: true };
        }

        return { roomCode: code, room, playerLeft: player };
      }
    }
    return null;
  }

  toggleReady(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        if (!player.isHost) {
          player.isReady = !player.isReady;
        }
        return { room, player };
      }
    }
    return null;
  }

  updateSettings(socketId, newSettings) {
    for (const room of this.rooms.values()) {
      if (room.hostId === socketId && room.state === 'LOBBY') {
        room.settings = { ...room.settings, ...newSettings };
        return room;
      }
    }
    return null;
  }

  kickPlayer(hostSocketId, targetSocketId) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.hostId === hostSocketId && room.players.has(targetSocketId)) {
        if (targetSocketId === hostSocketId) return null; // Cannot kick host
        const kicked = room.players.get(targetSocketId);
        room.players.delete(targetSocketId);
        return { room, kickedPlayer: kicked };
      }
    }
    return null;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode?.toUpperCase());
  }

  getRoomByPlayerId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return null;
  }

  getCleanRoomState(room) {
    if (!room) return null;
    const playersArr = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      isBot: p.isBot,
      role: p.role,
      isAlive: p.isAlive,
      kills: p.kills,
      survivalTime: p.survivalTime,
      color: p.color,
      powerup: p.powerup
    }));

    return {
      code: room.code,
      hostId: room.hostId,
      state: room.state,
      settings: room.settings,
      players: playersArr
    };
  }
}
