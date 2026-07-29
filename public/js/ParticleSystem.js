// High Performance Canvas Particle System for Shadow Hunt

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size = Math.max(0, p.size - (p.shrink || 4) * dt);

      if (p.life <= 0 || p.size <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  emitTrail(x, y, color) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      size: Math.random() * 4 + 2,
      shrink: 4,
      life: 0.4,
      maxLife: 0.4,
      color: color
    });
  }

  emitPowerupSparkle(x, y, color) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 15,
      vy: -Math.random() * 25,
      size: Math.random() * 3 + 2,
      shrink: 2,
      life: 0.5,
      maxLife: 0.5,
      color: color
    });
  }

  emitTeleportRing(x, y, color = '#EC4899') {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const speed = 140;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5,
        shrink: 5,
        life: 0.4,
        maxLife: 0.4,
        color: color
      });
    }
  }

  emitDeathBurst(x, y, color = '#FF3366') {
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 180 + 40;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 6 + 3,
        shrink: 5,
        life: 0.8,
        maxLife: 0.8,
        color: color
      });
    }
  }

  emitSpawnFlash(x, y) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 120;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5,
        shrink: 6,
        life: 0.5,
        maxLife: 0.5,
        color: '#00E5FF'
      });
    }
  }
}
