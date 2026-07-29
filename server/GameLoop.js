// Modular Server GameLoop for Shadow Hunt
// Fair Random Role Selection, Authoritative Physics & 10 Powerup Engine.

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
    this.decoys = [];
    this.powerupSpawnTimer = 0;
    this.nextPowerupSpawnDelay = 25;
    this.lastTickTime = Date.now();
    this.sequence = 0;

    this.TILE_SIZE = 40;
    this.PLAYER_RADIUS = 14;
    this.BASE_SPEED = 180 * room.settings.movementSpeed;

    this.POWERUP_TYPES = {
      SHIELD: { id: 'SHIELD', name: 'Shield Orb', duration: 10.0, color: '#00E5FF', weight: 15 },
      INVISIBLE: { id: 'INVISIBLE', name: 'Invisibility Orb', duration: 8.0, color: '#A855F7', weight: 12 },
      SPEED: { id: 'SPEED', name: 'Speed Boost', duration: 7.0, color: '#FACC15', weight: 18 },
      FREEZE: { id: 'FREEZE', name: 'Freeze Blast', duration: 0, color: '#06B6D4', weight: 10 },
      DASH: { id: 'DASH', name: 'Dash Ability', duration: 10.0, color: '#F97316', weight: 14 },
      TELEPORT: { id: 'TELEPORT', name: 'Teleport Orb', duration: 0, color: '#EC4899', weight: 8 },
      FLASH: { id: 'FLASH', name: 'Flash Bomb', duration: 3.0, color: '#FFFFFF', weight: 10 },
      DECOY: { id: 'DECOY', name: 'Decoy Clone', duration: 8.0, color: '#22C55E', weight: 12 },
      REVEAL: { id: 'REVEAL', name: 'Reveal Pulse', duration: 5.0, color: '#38BDF8', weight: 10 },
      HEAL: { id: 'HEAL', name: 'Healing Heart', duration: 0, color: '#EF4444', weight: 12 }
    };
  }

  start() {
    this.room.state = 'PLAYING';
    const generator = new MazeGenerator(21, 15);
    this.maze = generator.generate();

    const playersList = Array.from(this.room.players.values());
    if (playersList.length === 0) return;

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

    // FAIR RANDOM ROLE SELECTION (Prevents same Killer 2x in a row if possible)
    const eligibleKillers = playersList.filter(p => p.id !== this.room.lastKillerId);
    const candidatePool = eligibleKillers.length > 0 ? eligibleKillers : playersList;
    const selectedKiller = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    this.room.lastKillerId = selectedKiller.id;

    playersList.forEach((p, idx) => {
      p.isAlive = true;
      p.kills = 0;
      p.survivalTime = 0;
      p.powerup = null;
      p.powerupTimer = 0;
      p.hasShield = false;
      p.isBlinded = false;
      p.score = 0;

      if (p.id === selectedKiller.id) {
        p.role = 'KILLER';
        p.color = '#FF3366';
      } else {
        p.role = 'SURVIVOR';
        p.color = '#00E5FF';
      }

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
    this.decoys = [];
    this.lastTickTime = Date.now();

    if (this.room.settings.powerupsEnabled) {
      this.spawnInitialPowerups();
    }

    // Broadcast Game Start & Random Role Assignment
    this.broadcast({
      type: 'GAME_STARTING',
      map: this.maze,
      settings: this.room.settings,
      roundTime: this.timer,
      killerId: selectedKiller.id,
      killerName: selectedKiller.name
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

    this.elapsedSeconds += dt;
    if (this.elapsedSeconds >= 1.0) {
      this.timer -= Math.floor(this.elapsedSeconds);
      this.elapsedSeconds %= 1.0;

      for (const p of this.room.players.values()) {
        if (p.role === 'SURVIVOR' && p.isAlive) {
          p.survivalTime++;
        }
      }

      if (this.room.settings.powerupsEnabled) {
        this.powerupSpawnTimer++;
        if (this.powerupSpawnTimer >= this.nextPowerupSpawnDelay && this.activePowerups.length < 4) {
          this.powerupSpawnTimer = 0;
          this.nextPowerupSpawnDelay = Math.floor(Math.random() * 21) + 20;
          this.spawnWeightedPowerup();
        }
      }

      if (this.timer <= 0) {
        this.timer = 0;
        this.finishGame('SURVIVORS_WIN', 'Survivors survived the hunt!');
        return;
      }
    }

    this.updateBotAI(dt);
    this.updateDecoyClones(dt);

    const playersArr = Array.from(this.room.players.values());
    const aliveSurvivors = playersArr.filter(p => p.role === 'SURVIVOR' && p.isAlive);
    const killers = playersArr.filter(p => p.role === 'KILLER' && p.isAlive);

    for (const player of playersArr) {
      if (!player.isAlive) continue;

      if (player.powerupTimer > 0) {
        player.powerupTimer -= dt;
        if (player.powerupTimer <= 0) {
          player.powerup = null;
          player.powerupTimer = 0;
          player.isBlinded = false;
        }
      }

      let speed = this.BASE_SPEED;
      if (player.role === 'KILLER') speed *= this.room.settings.killerSpeedBonus;
      if (player.powerup === 'SPEED') speed *= 1.35;
      if (player.powerup === 'FROZEN') speed = 0;

      let moveX = player.vx * speed * dt;
      let moveY = player.vy * speed * dt;

      const nextPos = this.resolveMapCollision(player.x, player.y, moveX, moveY, this.PLAYER_RADIUS);
      player.x = nextPos.x;
      player.y = nextPos.y;

      if (this.room.settings.powerupsEnabled) {
        this.checkPowerupPickup(player);
      }
    }

    for (const killer of killers) {
      if (killer.powerup === 'FROZEN') continue;

      for (const survivor of aliveSurvivors) {
        const dist = Math.hypot(killer.x - survivor.x, killer.y - survivor.y);
        const killDist = (this.PLAYER_RADIUS * 2) + 4;

        if (dist <= killDist) {
          if (survivor.hasShield || survivor.powerup === 'SHIELD') {
            survivor.hasShield = false;
            survivor.powerup = null;
            survivor.powerupTimer = 0;

            this.broadcast({
              type: 'SHIELD_ABSORBED',
              survivorId: survivor.id,
              x: survivor.x,
              y: survivor.y
            });
            continue;
          }

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

    const remainingSurvivors = Array.from(this.room.players.values()).filter(p => p.role === 'SURVIVOR' && p.isAlive);
    if (remainingSurvivors.length === 0) {
      this.finishGame('KILLER_WINS', 'The Killer eliminated all survivors!');
      return;
    }

    this.broadcastSnapshot();
  }

  processPlayerInput(socketId, input) {
    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive || this.room.state !== 'PLAYING') return;

    let vx = input.dx || 0;
    let vy = input.dy || 0;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
      player.angle = Math.atan2(vy, vx);
    }

    player.vx = vx;
    player.vy = vy;

    if (input.usePowerup && player.powerup) {
      this.activateInstantPowerup(player);
    }
  }

  activateInstantPowerup(player) {
    const pType = player.powerup;

    if (pType === 'DASH') {
      const dashDist = this.TILE_SIZE * 4;
      const targetX = player.x + Math.cos(player.angle) * dashDist;
      const targetY = player.y + Math.sin(player.angle) * dashDist;
      const resolved = this.resolveMapCollision(player.x, player.y, targetX - player.x, targetY - player.y, this.PLAYER_RADIUS);
      player.x = resolved.x;
      player.y = resolved.y;
      player.powerup = null;

      this.broadcast({ type: 'POWERUP_EFFECT', effect: 'DASH', x: player.x, y: player.y, playerId: player.id });
    } else if (pType === 'TELEPORT') {
      const killers = Array.from(this.room.players.values()).filter(p => p.role === 'KILLER' && p.isAlive);
      const safeSpawns = this.maze.spawnPoints.filter(s => {
        const sx = (s.x + 0.5) * this.TILE_SIZE;
        const sy = (s.y + 0.5) * this.TILE_SIZE;
        return killers.every(k => Math.hypot(k.x - sx, k.y - sy) > 300);
      });

      const chosen = safeSpawns.length > 0 ? safeSpawns[Math.floor(Math.random() * safeSpawns.length)] : this.maze.spawnPoints[0];
      player.x = (chosen.x + 0.5) * this.TILE_SIZE;
      player.y = (chosen.y + 0.5) * this.TILE_SIZE;
      player.powerup = null;

      this.broadcast({ type: 'POWERUP_EFFECT', effect: 'TELEPORT', x: player.x, y: player.y, playerId: player.id });
    } else if (pType === 'FREEZE' && player.role === 'SURVIVOR') {
      for (const p of this.room.players.values()) {
        if (p.role === 'KILLER') {
          p.powerup = 'FROZEN';
          p.powerupTimer = 3.0;
        }
      }
      player.powerup = null;
      this.broadcast({ type: 'POWERUP_EFFECT', effect: 'FREEZE', playerId: player.id });
    } else if (pType === 'FLASH' && player.role === 'SURVIVOR') {
      for (const p of this.room.players.values()) {
        if (p.role === 'KILLER') {
          p.isBlinded = true;
          p.powerupTimer = 3.0;
        }
      }
      player.powerup = null;
      this.broadcast({ type: 'POWERUP_EFFECT', effect: 'FLASH', playerId: player.id });
    } else if (pType === 'DECOY' && player.role === 'SURVIVOR') {
      this.decoys.push({
        id: `decoy_${Date.now()}`,
        name: player.name,
        x: player.x,
        y: player.y,
        vx: Math.cos(player.angle + Math.PI / 2),
        vy: Math.sin(player.angle + Math.PI / 2),
        angle: player.angle,
        timer: 8.0,
        color: '#00E5FF'
      });
      player.powerup = null;
      this.broadcast({ type: 'POWERUP_EFFECT', effect: 'DECOY', x: player.x, y: player.y, playerId: player.id });
    }
  }

  updateDecoyClones(dt) {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const decoy = this.decoys[i];
      decoy.timer -= dt;

      if (decoy.timer <= 0) {
        this.decoys.splice(i, 1);
        continue;
      }

      if (Math.random() < 0.05) {
        const randAngle = Math.random() * Math.PI * 2;
        decoy.vx = Math.cos(randAngle);
        decoy.vy = Math.sin(randAngle);
        decoy.angle = randAngle;
      }

      const nextPos = this.resolveMapCollision(decoy.x, decoy.y, decoy.vx * this.BASE_SPEED * dt, decoy.vy * this.BASE_SPEED * dt, this.PLAYER_RADIUS);
      decoy.x = nextPos.x;
      decoy.y = nextPos.y;
    }
  }

  updateBotAI(dt) {
    const playersArr = Array.from(this.room.players.values());
    const aliveSurvivors = playersArr.filter(p => p.role === 'SURVIVOR' && p.isAlive);
    const killers = playersArr.filter(p => p.role === 'KILLER' && p.isAlive);

    for (const player of playersArr) {
      if (!player.isBot || !player.isAlive) continue;

      if (player.role === 'KILLER') {
        let target = null;
        let minDist = Infinity;
        for (const surv of [...aliveSurvivors, ...this.decoys]) {
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
          const fleeAngle = Math.atan2(player.y - nearestKiller.y, player.x - nearestKiller.x);
          player.vx = Math.cos(fleeAngle);
          player.vy = Math.sin(fleeAngle);
          player.angle = fleeAngle;
        } else {
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

    if (this.isCollidingWithWall(nextX, y, radius)) nextX = x;
    if (this.isCollidingWithWall(nextX, nextY, radius)) nextY = y;

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
          this.maze.grid[ty][tx] === 1
        ) {
          return true;
        }
      }
    }
    return false;
  }

  spawnInitialPowerups() {
    if (!this.maze || !this.maze.powerupSpawns) return;
    const selectedSpawns = [...this.maze.powerupSpawns].sort(() => Math.random() - 0.5).slice(0, 3);
    selectedSpawns.forEach(spawn => this.spawnWeightedPowerupAt(spawn.x, spawn.y));
  }

  spawnWeightedPowerup() {
    if (!this.maze || !this.maze.powerupSpawns || this.activePowerups.length >= 4) return;

    const playersArr = Array.from(this.room.players.values());
    const validSpawns = this.maze.powerupSpawns.filter(s => {
      const sx = (s.x + 0.5) * this.TILE_SIZE;
      const sy = (s.y + 0.5) * this.TILE_SIZE;
      return playersArr.every(p => Math.hypot(p.x - sx, p.y - sy) > 120);
    });

    const chosen = validSpawns.length > 0 ? validSpawns[Math.floor(Math.random() * validSpawns.length)] : this.maze.powerupSpawns[0];
    this.spawnWeightedPowerupAt(chosen.x, chosen.y);
  }

  spawnWeightedPowerupAt(tx, ty) {
    const typeKeys = Object.keys(this.POWERUP_TYPES);
    const totalWeight = typeKeys.reduce((acc, k) => acc + this.POWERUP_TYPES[k].weight, 0);
    let rand = Math.random() * totalWeight;

    let chosenType = 'SPEED';
    for (const key of typeKeys) {
      if (rand < this.POWERUP_TYPES[key].weight) {
        chosenType = key;
        break;
      }
      rand -= this.POWERUP_TYPES[key].weight;
    }

    this.activePowerups.push({
      id: `pw_${Date.now()}_${Math.random()}`,
      type: chosenType,
      x: (tx + 0.5) * this.TILE_SIZE,
      y: (ty + 0.5) * this.TILE_SIZE
    });
  }

  checkPowerupPickup(player) {
    for (let i = this.activePowerups.length - 1; i >= 0; i--) {
      const pw = this.activePowerups[i];
      const dist = Math.hypot(player.x - pw.x, player.y - pw.y);

      if (dist <= this.PLAYER_RADIUS + 14) {
        const pwData = this.POWERUP_TYPES[pw.type];

        if (pw.type === 'HEAL') {
          player.hasShield = true;
          player.score += 500;
        } else {
          player.powerup = pw.type;
          player.powerupTimer = pwData.duration;
          if (pw.type === 'SHIELD') player.hasShield = true;
        }

        this.activePowerups.splice(i, 1);

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
      hasShield: p.hasShield,
      isBlinded: p.isBlinded,
      powerupTimer: Math.ceil(p.powerupTimer)
    }));

    this.broadcast({
      type: 'STATE_SNAPSHOT',
      seq: this.sequence,
      timer: this.timer,
      players: playersArr,
      decoys: this.decoys,
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
