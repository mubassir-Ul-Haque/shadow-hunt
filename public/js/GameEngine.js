// Modular Canvas Top-Down Renderer & Client Engine for Shadow Hunt

import { ParticleSystem } from './ParticleSystem.js';

export class GameEngine {
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioEngine = audioEngine;
    this.particles = new ParticleSystem();

    this.map = null;
    this.myPlayerId = null;
    this.players = new Map(); // id -> interpolated player obj
    this.targetPlayers = new Map(); // id -> raw server target obj
    this.powerups = [];

    this.TILE_SIZE = 40;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.lastRenderTime = performance.now();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    this.ctx.scale(dpr, dpr);
    this.calculateViewportScale();
  }

  calculateViewportScale() {
    if (!this.map) return;
    const mapPixelWidth = this.map.width * this.TILE_SIZE;
    const mapPixelHeight = this.map.height * this.TILE_SIZE;

    const availableWidth = window.innerWidth * 0.94;
    const availableHeight = window.innerHeight * 0.82;

    const scaleX = availableWidth / mapPixelWidth;
    const scaleY = availableHeight / mapPixelHeight;

    this.scale = Math.min(scaleX, scaleY, 1.3);
    this.offsetX = (window.innerWidth - mapPixelWidth * this.scale) / 2;
    this.offsetY = (window.innerHeight - mapPixelHeight * this.scale) / 2 + 20;
  }

  setMap(mapData) {
    this.map = mapData;
    this.calculateViewportScale();
  }

  updateSnapshot(snapshot, myId) {
    this.myPlayerId = myId;
    this.powerups = snapshot.powerups || [];

    snapshot.players.forEach(p => {
      this.targetPlayers.set(p.id, p);

      if (!this.players.has(p.id)) {
        // Initialize position immediately for new players
        this.players.set(p.id, { ...p });
        this.particles.emitSpawnFlash(p.x, p.y);
      }
    });

    // Remove disconnected players
    const currentIds = new Set(snapshot.players.map(p => p.id));
    for (const id of this.players.keys()) {
      if (!currentIds.has(id)) {
        this.players.delete(id);
        this.targetPlayers.delete(id);
      }
    }
  }

  render() {
    const now = performance.now();
    const dt = Math.min((now - this.lastRenderTime) / 1000, 0.1);
    this.lastRenderTime = now;

    // Clear Screen
    this.ctx.fillStyle = '#06080D';
    this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    if (!this.map) return;

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // 1. Render Map Tilemap Grid & Walls
    this.renderTilemap();

    // 2. Render Active Collectible Powerups
    this.renderPowerups(now);

    // 3. Interpolate & Render Players
    this.updateAndRenderPlayers(dt, now);

    // 4. Render Particle System
    this.particles.update(dt);
    this.particles.render(this.ctx);

    this.ctx.restore();
  }

  renderTilemap() {
    const tileSize = this.TILE_SIZE;

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tileType = this.map.grid[y][x];
        const px = x * tileSize;
        const py = y * tileSize;

        if (tileType === 1) { // WALL
          this.ctx.fillStyle = '#141D2E';
          this.ctx.fillRect(px, py, tileSize, tileSize);

          // Wall inner border highlight
          this.ctx.strokeStyle = '#1E2C44';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

          // Subtle top glow
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          this.ctx.fillRect(px, py, tileSize, 4);
        } else { // PATH / EMPTY
          this.ctx.fillStyle = '#0C101A';
          this.ctx.fillRect(px, py, tileSize, tileSize);

          // Subtle floor grid line
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(px, py, tileSize, tileSize);
        }
      }
    }
  }

  renderPowerups(now) {
    for (const pw of this.powerups) {
      this.ctx.save();
      const bounce = Math.sin(now / 200) * 3;

      let color = '#00E5FF';
      let icon = '⚡';
      if (pw.type === 'SHIELD') { color = '#00E676'; icon = '🛡️'; }
      else if (pw.type === 'FREEZE_KILLER') { color = '#9C27B0'; icon = '❄️'; }
      else if (pw.type === 'INVISIBLE') { color = '#FFEB3B'; icon = '👻'; }
      else if (pw.type === 'FLASH') { color = '#FF9800'; icon = '⚡'; }

      // Glow circle
      this.ctx.fillStyle = color;
      this.ctx.globalAlpha = 0.3;
      this.ctx.beginPath();
      this.ctx.arc(pw.x, pw.y + bounce, 16, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner Icon
      this.ctx.globalAlpha = 1.0;
      this.ctx.font = '16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(icon, pw.x, pw.y + bounce);

      this.ctx.restore();
    }
  }

  updateAndRenderPlayers(dt, now) {
    const lerpSpeed = 16 * dt;
    let myPlayer = null;
    let killerPlayer = null;

    // Linear Entity Interpolation (LERP)
    for (const [id, target] of this.targetPlayers.entries()) {
      let current = this.players.get(id);
      if (!current) continue;

      current.x += (target.x - current.x) * lerpSpeed;
      current.y += (target.y - current.y) * lerpSpeed;
      current.angle = target.angle;
      current.isAlive = target.isAlive;
      current.role = target.role;
      current.powerup = target.powerup;
      current.name = target.name;
      current.color = target.color;

      if (id === this.myPlayerId) myPlayer = current;
      if (current.role === 'KILLER' && current.isAlive) killerPlayer = current;

      // Particle movement trail
      if (current.isAlive && (Math.abs(target.vx) > 0.1 || Math.abs(target.vy) > 0.1)) {
        this.particles.emitTrail(current.x, current.y, current.role === 'KILLER' ? '#FF3366' : '#00E5FF');
        if (id === this.myPlayerId) {
          this.audioEngine.playFootstep();
        }
      }
    }

    // Audio Proximity calculation for heartbeat
    if (myPlayer && killerPlayer && myPlayer.role === 'SURVIVOR' && myPlayer.isAlive) {
      const distToKiller = Math.hypot(killerPlayer.x - myPlayer.x, killerPlayer.y - myPlayer.y);
      this.audioEngine.updateProximityHeartbeat(distToKiller);
    }

    // Render Players
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;

      this.ctx.save();

      // Render Player Glow Aura
      const radius = 14;
      const isKiller = player.role === 'KILLER';
      const color = isKiller ? '#FF3366' : (player.color || '#00E5FF');

      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = isKiller ? 24 : 12;

      // Draw Main Player Body Circle
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Direction Indicator Line
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(player.x, player.y);
      this.ctx.lineTo(
        player.x + Math.cos(player.angle) * (radius + 6),
        player.y + Math.sin(player.angle) * (radius + 6)
      );
      this.ctx.stroke();

      // Powerup Shield Aura
      if (player.powerup === 'SHIELD') {
        this.ctx.strokeStyle = '#00E676';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, radius + 6, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Name Tag above Player
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(player.name, player.x, player.y - radius - 8);

      // Killer Crown/Icon Tag
      if (isKiller) {
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText('👑 KILLER', player.x, player.y - radius - 22);
      }

      this.ctx.restore();
    }
  }

  triggerEliminationEffect(x, y) {
    this.particles.emitDeathBurst(x, y, '#FF3366');
    this.audioEngine.playElimination();
  }
}
