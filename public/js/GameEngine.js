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
    this.players = new Map();
    this.targetPlayers = new Map();
    this.decoys = [];
    this.powerups = [];

    this.TILE_SIZE = 40;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.lastRenderTime = performance.now();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resizeCanvas(), 200));

    // 10 Power-Up Visual Configs
    this.POWERUP_CONFIG = {
      SHIELD: { color: '#00E5FF', icon: '🛡️' },
      INVISIBLE: { color: '#A855F7', icon: '👻' },
      SPEED: { color: '#FACC15', icon: '⚡' },
      FREEZE: { color: '#06B6D4', icon: '❄️' },
      DASH: { color: '#F97316', icon: '💨' },
      TELEPORT: { color: '#EC4899', icon: '🌀' },
      FLASH: { color: '#FFFFFF', icon: '💥' },
      DECOY: { color: '#22C55E', icon: '🤖' },
      REVEAL: { color: '#38BDF8', icon: '📡' },
      HEAL: { color: '#EF4444', icon: '❤️' }
    };
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.scale(dpr, dpr);
    this.calculateViewportScale();
  }

  calculateViewportScale() {
    if (!this.map) return;
    const mapPixelWidth = this.map.width * this.TILE_SIZE;
    const mapPixelHeight = this.map.height * this.TILE_SIZE;

    const isMobile = window.innerWidth <= 768;
    const availableWidth = window.innerWidth * (isMobile ? 0.98 : 0.94);
    const availableHeight = window.innerHeight * (isMobile ? 0.85 : 0.80);

    const scaleX = availableWidth / mapPixelWidth;
    const scaleY = availableHeight / mapPixelHeight;

    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (window.innerWidth - mapPixelWidth * this.scale) / 2;
    this.offsetY = (window.innerHeight - mapPixelHeight * this.scale) / 2 + (isMobile ? 15 : 20);
  }

  setMap(mapData) {
    this.map = mapData;
    this.calculateViewportScale();
  }

  updateSnapshot(snapshot, myId) {
    this.myPlayerId = myId;
    this.powerups = snapshot.powerups || [];
    this.decoys = snapshot.decoys || [];

    snapshot.players.forEach(p => {
      this.targetPlayers.set(p.id, p);

      if (!this.players.has(p.id)) {
        this.players.set(p.id, { ...p });
        this.particles.emitSpawnFlash(p.x, p.y);
      }
    });

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

    this.ctx.fillStyle = '#06080D';
    this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    if (!this.map) return;

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // 1. Render Map Tilemap Grid & Walls
    this.renderTilemap();

    // 2. Render 10 Collectible Floating Powerup Orbs
    this.renderPowerups(now);

    // 3. Render AI Decoy Clones
    this.renderDecoys(dt);

    // 4. Interpolate & Render Players with Powerup FX
    this.updateAndRenderPlayers(dt, now);

    // 5. Render Particle System
    this.particles.update(dt);
    this.particles.render(this.ctx);

    this.ctx.restore();

    // 6. Blinding Flash Overlay for Blinded Killer
    const myPlayer = this.players.get(this.myPlayerId);
    if (myPlayer && myPlayer.isBlinded) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
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

          this.ctx.strokeStyle = '#1E2C44';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          this.ctx.fillRect(px, py, tileSize, 4);
        } else { // PATH / EMPTY
          this.ctx.fillStyle = '#0C101A';
          this.ctx.fillRect(px, py, tileSize, tileSize);

          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(px, py, tileSize, tileSize);
        }
      }
    }
  }

  renderPowerups(now) {
    for (const pw of this.powerups) {
      const cfg = this.POWERUP_CONFIG[pw.type] || { color: '#00E5FF', icon: '⚡' };
      const floatOffsetY = Math.sin(now / 180) * 4;

      this.ctx.save();

      // Outer Glowing Ring & Pulse
      this.ctx.fillStyle = cfg.color;
      this.ctx.globalAlpha = 0.35 + Math.sin(now / 150) * 0.15;
      this.ctx.beginPath();
      this.ctx.arc(pw.x, pw.y + floatOffsetY, 18, 0, Math.PI * 2);
      this.ctx.fill();

      // Emit Sparkles
      if (Math.random() < 0.2) {
        this.particles.emitPowerupSparkle(pw.x, pw.y + floatOffsetY, cfg.color);
      }

      // Icon Center
      this.ctx.globalAlpha = 1.0;
      this.ctx.font = '16px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(cfg.icon, pw.x, pw.y + floatOffsetY);

      this.ctx.restore();
    }
  }

  renderDecoys(dt) {
    for (const decoy of this.decoys) {
      this.ctx.save();
      const radius = 14;

      this.ctx.shadowColor = '#22C55E';
      this.ctx.shadowBlur = 12;

      this.ctx.fillStyle = '#00E5FF';
      this.ctx.beginPath();
      this.ctx.arc(decoy.x, decoy.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`🤖 ${decoy.name}`, decoy.x, decoy.y - radius - 8);

      this.ctx.restore();
    }
  }

  updateAndRenderPlayers(dt, now) {
    const lerpSpeed = 16 * dt;
    let myPlayer = null;
    let killerPlayer = null;

    for (const [id, target] of this.targetPlayers.entries()) {
      let current = this.players.get(id);
      if (!current) continue;

      current.x += (target.x - current.x) * lerpSpeed;
      current.y += (target.y - current.y) * lerpSpeed;
      current.angle = target.angle;
      current.isAlive = target.isAlive;
      current.role = target.role;
      current.powerup = target.powerup;
      current.hasShield = target.hasShield;
      current.isBlinded = target.isBlinded;
      current.name = target.name;
      current.color = target.color;

      if (id === this.myPlayerId) myPlayer = current;
      if (current.role === 'KILLER' && current.isAlive) killerPlayer = current;

      if (current.isAlive && (Math.abs(target.vx) > 0.1 || Math.abs(target.vy) > 0.1)) {
        let trailColor = current.role === 'KILLER' ? '#FF3366' : '#00E5FF';
        if (current.powerup === 'SPEED') trailColor = '#FACC15';
        if (current.powerup === 'DASH') trailColor = '#F97316';

        this.particles.emitTrail(current.x, current.y, trailColor);
        if (id === this.myPlayerId) {
          this.audioEngine.playFootstep();
        }
      }
    }

    if (myPlayer && killerPlayer && myPlayer.role === 'SURVIVOR' && myPlayer.isAlive) {
      const distToKiller = Math.hypot(killerPlayer.x - myPlayer.x, killerPlayer.y - myPlayer.y);
      this.audioEngine.updateProximityHeartbeat(distToKiller);
    }

    for (const player of this.players.values()) {
      if (!player.isAlive) continue;

      this.ctx.save();

      const radius = 14;
      const isKiller = player.role === 'KILLER';
      let color = isKiller ? '#FF3366' : (player.color || '#00E5FF');
      let opacity = 1.0;

      // Invisibility Powerup Effect (70% transparent)
      if (player.powerup === 'INVISIBLE') {
        opacity = 0.3;
        color = '#A855F7';
      }

      this.ctx.globalAlpha = opacity;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = isKiller ? 24 : 12;

      // Frozen Ice Overlay
      if (player.powerup === 'FROZEN') {
        color = '#06B6D4';
        this.ctx.shadowColor = '#06B6D4';
      }

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

      // Blue Shield Bubble Aura
      if (player.hasShield || player.powerup === 'SHIELD') {
        this.ctx.strokeStyle = '#00E5FF';
        this.ctx.lineWidth = 3.5;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, radius + 7, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Name Tag above Player
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(player.name, player.x, player.y - radius - 8);

      if (isKiller) {
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(player.powerup === 'FROZEN' ? '❄️ FROZEN' : '👑 KILLER', player.x, player.y - radius - 22);
      }

      this.ctx.restore();
    }
  }

  triggerEliminationEffect(x, y) {
    this.particles.emitDeathBurst(x, y, '#FF3366');
    this.audioEngine.playElimination();
  }
}
