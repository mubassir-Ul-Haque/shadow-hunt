// Main Entry & WebSocket Network Orchestrator for Shadow Hunt

import { AudioEngine } from './AudioEngine.js';
import { GameEngine } from './GameEngine.js';
import { UIController } from './UIController.js';
import { TouchController } from './TouchController.js';

class App {
  constructor() {
    this.audio = new AudioEngine();
    this.canvas = document.getElementById('game-canvas');
    this.game = new GameEngine(this.canvas, this.audio);
    this.ui = new UIController(this.audio);

    this.touch = new TouchController((touchInput) => {
      this.handleTouchInput(touchInput);
    }, this.audio);

    this.ws = null;
    this.myPlayerId = null;
    this.inputState = { dx: 0, dy: 0, usePowerup: false };
    this.keys = {};
    this.lastInputTime = 0;
    this.pingStartTime = 0;

    this.initNetwork();
    this.bindInputs();
    this.startRenderLoop();
  }

  initNetwork() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to Shadow Hunt Server!');
      this.startPingLoop();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (e) {
        console.error('Error handling WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server. Retrying...');
      setTimeout(() => this.initNetwork(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  }

  send(dataObj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(dataObj));
    }
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'CONNECTED':
        this.myPlayerId = msg.socketId;
        break;

      case 'ROOM_CREATED':
      case 'ROOM_JOINED':
        this.ui.updateLobbyRoom(msg.room, this.myPlayerId);
        break;

      case 'ROOM_UPDATE':
        this.ui.updateLobbyRoom(msg.room, this.myPlayerId);
        break;

      case 'GAME_STARTING':
        this.audio.init();
        this.game.setMap(msg.map);
        this.ui.showScreen('game');
        this.game.calculateViewportScale();
        break;

      case 'STATE_SNAPSHOT':
        this.game.updateSnapshot(msg, this.myPlayerId);
        this.ui.updateHUD(msg, this.myPlayerId);
        break;

      case 'PLAYER_ELIMINATED':
        this.game.triggerEliminationEffect(msg.x, msg.y);
        break;

      case 'POWERUP_COLLECTED':
        if (msg.playerId === this.myPlayerId) {
          this.ui.showPowerupToast(msg.powerupType);
          this.audio.playClick();
        }
        break;

      case 'GAME_FINISHED':
        this.ui.showMatchResults(msg);
        break;

      case 'KICKED':
      case 'ERROR':
        alert(msg.message || msg.reason);
        break;

      case 'PONG': {
        const latency = Math.round(performance.now() - this.pingStartTime);
        this.ui.updatePing(latency);
        break;
      }
    }
  }

  bindInputs() {
    this.ui.btnCreateRoom.addEventListener('click', () => {
      const name = this.ui.inputPlayerName.value.trim() || 'Player 1';
      localStorage.setItem('sh_player_name', name);
      this.audio.playClick();

      this.send({
        type: 'CREATE_ROOM',
        playerName: name,
        settings: {
          roundTime: parseInt(this.ui.selectRoundTime.value, 10),
          maxPlayers: parseInt(this.ui.selectMaxPlayers.value, 10),
          botFillEnabled: this.ui.checkBotFill.checked
        }
      });
    });

    this.ui.btnJoinRoom.addEventListener('click', () => {
      const name = this.ui.inputPlayerName.value.trim() || 'Player 1';
      const code = this.ui.inputRoomCode.value.trim();
      if (!code) {
        alert('Please enter a valid room code (e.g. SH-XXXX)!');
        return;
      }
      localStorage.setItem('sh_player_name', name);
      this.audio.playClick();

      this.send({
        type: 'JOIN_ROOM',
        playerName: name,
        roomCode: code
      });
    });

    this.ui.btnToggleReady.addEventListener('click', () => {
      this.audio.playClick();
      this.send({ type: 'TOGGLE_READY' });
    });

    this.ui.btnStartGame.addEventListener('click', () => {
      this.audio.playClick();
      this.send({ type: 'START_GAME' });
    });

    this.ui.btnLeaveRoom.addEventListener('click', () => {
      location.reload();
    });

    this.ui.btnResultsLobby.addEventListener('click', () => {
      this.audio.playClick();
      this.send({ type: 'RETURN_TO_LOBBY' });
      this.ui.showScreen('lobby');
    });

    // Keyboard Listeners (WASD + Arrow Keys)
    window.addEventListener('keydown', (e) => {
      this.audio.resume();
      this.keys[e.key.toLowerCase()] = true;
      this.keys[e.code] = true;
      this.processMovementKeys();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.keys[e.code] = false;
      this.processMovementKeys();
    });
  }

  handleTouchInput(touchInput) {
    this.audio.resume();
    this.inputState = {
      dx: touchInput.dx,
      dy: touchInput.dy,
      usePowerup: touchInput.usePowerup
    };

    this.send({
      type: 'INPUT',
      input: this.inputState
    });
  }

  processMovementKeys() {
    let dx = 0;
    let dy = 0;

    if (this.keys['w'] || this.keys['arrowup'] || this.keys['KeyW']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown'] || this.keys['KeyS']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft'] || this.keys['KeyA']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright'] || this.keys['KeyD']) dx += 1;

    const usePowerup = !!(this.keys[' '] || this.keys['Space']);

    if (dx !== this.inputState.dx || dy !== this.inputState.dy || usePowerup !== this.inputState.usePowerup) {
      this.inputState = { dx, dy, usePowerup };
      this.send({
        type: 'INPUT',
        input: this.inputState
      });
    }
  }

  startPingLoop() {
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pingStartTime = performance.now();
        this.send({ type: 'PING', clientTime: Date.now() });
      }
    }, 3000);
  }

  startRenderLoop() {
    const loop = () => {
      if (this.ui.currentScreen === 'game') {
        this.game.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
