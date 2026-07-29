// Modular Server GameLoop for Shadow Hunt
// Executes 60Hz authoritative physics, collision validation, powerup spawning, and state synchronization.

import { MazeGenerator } from './MazeGenerator.js';

export class GameLoop {
  constructor(room, broadcastCallback) {
    this.room = room;
    this.broadcast = broadcastCallback;
    this.intervalId = null;
    this.fps = 60;
    this.tickRate = 1000 / this.fps;

    this.maze = null;
    this.timer = room.settings.roundTime;
    this.elapsedSeconds = 0;
    this.activePowerups = [];
    this.powerupSpawnTimer = 0;
    this.lastTickTime = Date.now();
    this.sequence = 0;

    // Tile size in world pixels
    this.TILE_SIZE = 40;
    this.PLAYER_RADIUS = 14;
    this.BASE_SPEED = 180 * room.settings.movementSpeed; // pixels per second
  }

  start() {
    this.room.state = 'PLAYING';
    const generator = new MazeGenerator(21, 15);
    this.maze = generator.generate();

    // Assign roles randomly
    const playersList = Array.from(this.room.players.values());
    if (playersList.length === 0) return;

    // Add bots if botFillEnabled is checked and player count < minPlayers
    if (this.room.settings.botFillEnabled && playersList.length < 4) {
      const neededBots = 4 - playersList.length;
      for (let i = 1; i <= neededBots; i++) {
        const botId = `bot_${Date.now()}_${i}`;
        const botName = `Bot ${i}`;
        const { player } = this.room.addPlayerToRoom(this.room.code, botId, botName, true);
        if (player) {
          player.isReady = true;
          playersList.push(player);
        }
      }
    }

    // Select Killer
    const killerIndex = Math.floor(Math.random() * playersList.length);
    playersList.forEach((p, idx) => {
      p.isAlive = true;
      p.kills = 0;
      p.survivalTime = 0;
      p.powerup = null;
      p.powerupTimer = 0;

      if (idx === killerIndex) {
        p.role = 'KILLER';
        p.color = '#FF3366'; // Crimson red glow
      } else {
        p.role = 'SURVIVOR';
        p.color = '#00E5FF'; // Cyan blue
      }

      // Spawn location assignment
      const spawnTile = this.maze.spawnPoints[idx % this.maze.spawnPoints.length];
      p.x = (spawnTile.x + 0.5) * this.TILE_SIZE;
      p.y = (spawnTile.y + 0.5) * this.TILE_SIZE;
      p.vx = 0;
      p.vy = 0;
      p.angle = 0;
    });

    this.timer = this.room.settings.roundTime;
    this.elapsedSeconds = 0;
    this.activePowerups = [];
    this.lastTickTime = Date.now();

    // Spawn initial powerups if enabled
    if (this.room.settings.powerupsEnabled) {
      this.spawnInitialPowerups();
    }

    // Notify room game is starting with map & role info
    this.broadcast({
      type: 'GAME_STARTING',
      map: this.maze,
      settings: this.room.settings,
      roundTime: this.timer
    });

    this.intervalId = setInterval(() => this.tick(), this.tickRate);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;
    this.sequence++;

    // Update Timer
    this.elapsedSeconds += dt;
    if (this.elapsedSeconds >= 1.0) {
      this.timer -= Math.floor(this.elapsedSeconds);
      this.elapsedSeconds %= 1.0;

      // Update alive survivors' survival time
      for (const p of this.room.players.values()) {
        if (p.role === 'SURVIVOR' && p.isAlive) {
          p.survivalTime++;
        }
      }

      // Spawn dynamic powerups every 20 seconds
      if (this.room.settings.powerupsEnabled) {
        this.powerupSpawnTimer++;
        if (this.powerupSpawnTimer >= 20 && this.activePowerups.length < 5) {
          this.powerupSpawnTimer = 0;
          this.spawnRandomPowerup();
        }
      }

      // Check time expire win condition
      if (this.timer <= 0) {
        this.timer = 0;
        this.finishGame('SURVIVORS_WIN', 'Survivors survived the hunt!');
        return;
      }
    }

    // Process Bot AI Movement
    this.updateBotAI(dt);

    // Update Player Movement & Collisions
    const playersArr = Array.from(this.room.players.values());
    const aliveSurvivors = playersArr.filter(p => p.role === 'SURVIVOR' && p.isAlive);
    const killers = playersArr.filter(p => p.role === 'KILLER' && p.isAlive);

    for (const player of playersArr) {
      if (!player.isAlive) continue;

      // Handle active powerup timers
      if (player.powerupTimer > 0) {
        player.powerupTimer -= dt;
        if (player.powerupTimer <= 0) {
          player.powerup = null;
          player.powerupTimer = 0;
        }
      }

      // Determine movement speed
      let speed = this.BASE_SPEED;
      if (player.role === 'KILLER') {
        speed *= this.room.settings.killerSpeedBonus;
      }
      if (player.powerup === 'SPEED_BOOST') {
        speed *= 1.4;
      }
      if (player.powerup === 'FROZEN') {
        speed = 0;
      }

      // Move player with velocity vector
      let moveX = player.vx * speed * dt;
      let moveY = player.vy * speed * dt;

      // Validate & resolve map collision against wall tiles
      const nextPos = this.resolveMapCollision(player.x, player.y, moveX, moveY, this.PLAYER_RADIUS);
      player.x = nextPos.x;
      player.y = nextPos.y;

      // Check Powerup Pickups
      if (this.room.settings.powerupsEnabled) {
        this.checkPowerupPickup(player);
      }
    }

    // Server Authoritative Collision: Killer vs Survivor
    for (const killer of killers) {
      if (killer.powerup === 'FROZEN') continue;

      for (const survivor of aliveSurvivors) {
        // Skip if survivor has active shield powerup
        if (survivor.powerup === 'SHIELD') continue;

        const dist = Math.hypot(killer.x - survivor.x, killer.y - survivor.y);
        const killDist = (this.PLAYER_RADIUS * 2) + 4;

        if (dist <= killDist) {
          // Survivor eliminated!
          survivor.isAlive = false;
          survivor.role = 'SPECTATOR';
          killer.kills++;

          this.broadcast({
            type: 'PLAYER_ELIMINATED',
            victimId: survivor.id,
            victimName: survivor.name,
            killerId: killer.id,
            killerName: killer.name,
            x: survivor.x,
            y: survivor.y
          });
        }
      }
    }

    // Check Victory Condition: All Survivors Dead -> Killer Wins
    const remainingSurvivors = Array.from(this.room.players.values()).filter(p => p.role === 'SURVIVOR' && p.isAlive);
    if (remainingSurvivors.length === 0) {
      this.finishGame('KILLER_WINS', 'The Killer eliminated all survivors!');
      return;
    }

    // Broadcast snapshot update to room
    this.broadcastSnapshot();
  }

  processPlayerInput(socketId, input) {
    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive || this.room.state !== 'PLAYING') return;

    let vx = input.dx || 0;
    let vy = input.dy || 0;

    // Normalize diagonal vector
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
      player.angle = Math.atan2(vy, vx);
    }

    player.vx = vx;
    player.vy = vy;

    // Handle instant powerup activation (Flash/Teleport)
    if (input.usePowerup && player.powerup) {
      this.activateInstantPowerup(player);
    }
  }

  activateInstantPowerup(player) {
    if (player.powerup === 'FLASH') {
      // Teleport forward in direction faced
      const flashDist = 120;
      const targetX = player.x + Math.cos(player.angle) * flashDist;
      const targetY = player.y + Math.sin(player.angle) * flashDist;
      const resolved = this.resolveMapCollision(player.x, player.y, targetX - player.x, targetY - player.y, this.PLAYER_RADIUS);
      player.x = resolved.x;
      player.y = resolved.y;
      player.powerup = null;
    } else if (player.powerup === 'RANDOM_TELEPORT') {
      const spawn = this.maze.spawnPoints[Math.floor(Math.random() * this.maze.spawnPoints.length)];
      player.x = (spawn.x + 0.5) * this.TILE_SIZE;
      player.y = (spawn.y + 0.5) * this.TILE_SIZE;
      player.powerup = null;
    } else if (player.powerup === 'FREEZE_KILLER' && player.role === 'SURVIVOR') {
      for (const p of this.room.players.values()) {
        if (p.role === 'KILLER') {
          p.powerup = 'FROZEN';
          p.powerupTimer = 3.5; // Freeze killer for 3.5 seconds
        }
      }
      player.powerup = null;
    }
  }

  updateBotAI(dt) {
    const playersArr = Array.from(this.room.players.values());
    const aliveSurvivors = playersArr.filter(p => p.role === 'SURVIVOR' && p.isAlive);
    const killers = playersArr.filter(p => p.role === 'KILLER' && p.isAlive);

    for (const player of playersArr) {
      if (!player.isBot || !player.isAlive) continue;

      if (player.role === 'KILLER') {
        // Hunt nearest survivor
        let target = null;
        let minDist = Infinity;
        for (const surv of aliveSurvivors) {
          const d = Math.hypot(surv.x - player.x, surv.y - player.y);
          if (d < minDist) {
            minDist = d;
            target = surv;
          }
        }
        if (target) {
          const angle = Math.atan2(target.y - player.y, target.x - player.x);
          player.vx = Math.cos(angle);
          player.vy = Math.sin(angle);
          player.angle = angle;
        }
      } else {
        // Survivor Bot: Flee from nearest killer or roam
        let nearestKiller = null;
        let minDist = Infinity;
        for (const k of killers) {
          const d = Math.hypot(k.x - player.x, k.y - player.y);
          if (d < minDist) {
            minDist = d;
            nearestKiller = k;
          }
        }

        if (nearestKiller && minDist < 300) {
          // Run opposite direction
          const fleeAngle = Math.atan2(player.y - nearestKiller.y, player.x - nearestKiller.x);
          player.vx = Math.cos(fleeAngle);
          player.vy = Math.sin(fleeAngle);
          player.angle = fleeAngle;
        } else {
          // Roam periodically
          if (!player.botRoamDir || Math.random() < 0.03) {
            const roamAngle = Math.random() * Math.PI * 2;
            player.botRoamDir = { vx: Math.cos(roamAngle), vy: Math.sin(roamAngle), angle: roamAngle };
          }
          player.vx = player.botRoamDir.vx;
          player.vy = player.botRoamDir.vy;
          player.angle = player.botRoamDir.angle;
        }
      }
    }
  }

  resolveMapCollision(x, y, dx, dy, radius) {
    let nextX = x + dx;
    let nextY = y + dy;

    // Check X direction collision
    if (this.isCollidingWithWall(nextX, y, radius)) {
      nextX = x;
    }
    // Check Y direction collision
    if (this.isCollidingWithWall(nextX, nextY, radius)) {
      nextY = y;
    }

    return { x: nextX, y: nextY };
  }

  isCollidingWithWall(px, py, radius) {
    const minTileX = Math.floor((px - radius) / this.TILE_SIZE);
    const maxTileX = Math.floor((px + radius) / this.TILE_SIZE);
    const minTileY = Math.floor((py - radius) / this.TILE_SIZE);
    const maxTileY = Math.floor((py + radius) / this.TILE_SIZE);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        if (
          ty < 0 || ty >= this.maze.height ||
          tx < 0 || tx >= this.maze.width ||
          this.maze.grid[ty][tx] === 1 // WALL
        ) {
          return true;
        }
      }
    }
    return false;
  }

  spawnInitialPowerups() {
    if (!this.maze || !this.maze.powerupSpawns) return;
    const types = ['SPEED_BOOST', 'SHIELD', 'FREEZE_KILLER', 'INVISIBLE', 'FLASH', 'RANDOM_TELEPORT'];
    const selectedSpawns = [...this.maze.powerupSpawns].sort(() => Math.random() - 0.5).slice(0, 4);

    selectedSpawns.forEach((spawn, idx) => {
      this.activePowerups.push({
        id: `pw_${Date.now()}_${idx}`,
        type: types[Math.floor(Math.random() * types.length)],
        x: (spawn.x + 0.5) * this.TILE_SIZE,
        y: (spawn.y + 0.5) * this.TILE_SIZE
      });
    });
  }

  spawnRandomPowerup() {
    if (!this.maze || !this.maze.powerupSpawns) return;
    const types = ['SPEED_BOOST', 'SHIELD', 'FREEZE_KILLER', 'INVISIBLE', 'FLASH', 'RANDOM_TELEPORT'];
    const spawn = this.maze.powerupSpawns[Math.floor(Math.random() * this.maze.powerupSpawns.length)];

    this.activePowerups.push({
      id: `pw_${Date.now()}_${Math.random()}`,
      type: types[Math.floor(Math.random() * types.length)],
      x: (spawn.x + 0.5) * this.TILE_SIZE,
      y: (spawn.y + 0.5) * this.TILE_SIZE
    });
  }

  checkPowerupPickup(player) {
    for (let i = this.activePowerups.length - 1; i >= 0; i--) {
      const pw = this.activePowerups[i];
      const dist = Math.hypot(player.x - pw.x, player.y - pw.y);

      if (dist <= this.PLAYER_RADIUS + 12) {
        player.powerup = pw.type;
        player.powerupTimer = pw.type === 'SHIELD' ? 6.0 : pw.type === 'SPEED_BOOST' ? 5.0 : pw.type === 'INVISIBLE' ? 4.0 : 0;
        const pickedPw = this.activePowerups.splice(i, 1)[0];

        this.broadcast({
          type: 'POWERUP_COLLECTED',
          playerId: player.id,
          playerName: player.name,
          powerupType: pw.type,
          x: pw.x,
          y: pw.y
        });
      }
    }
  }

  broadcastSnapshot() {
    const playersArr = Array.from(this.room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isAlive: p.isAlive,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx * 100) / 100,
      vy: Math.round(p.vy * 100) / 100,
      angle: Math.round(p.angle * 100) / 100,
      color: p.color,
      kills: p.kills,
      survivalTime: p.survivalTime,
      powerup: p.powerup,
      powerupTimer: Math.ceil(p.powerupTimer)
    }));

    this.broadcast({
      type: 'STATE_SNAPSHOT',
      seq: this.sequence,
      timer: this.timer,
      players: playersArr,
      powerups: this.activePowerups
    });
  }

  finishGame(winner, reason) {
    this.stop();
    this.room.state = 'FINISHED';

    const playersArr = Array.from(this.room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isAlive: p.isAlive,
      kills: p.kills,
      survivalTime: p.survivalTime
    }));

    this.broadcast({
      type: 'GAME_FINISHED',
      winner,
      reason,
      stats: playersArr
    });
  }
}
