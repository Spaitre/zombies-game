// Simulación PURA del enemigo (IA, movimiento, verticalidad, ataque a distancia,
// muerte): sin Three.js. Estado en {x,y,z}. Depende de la interfaz `world` (en el
// cliente la cumple `Game`): nav.flowDir, walls.resolveCircle, clampToWorld,
// supportHeight, spawnEnemyBullet. Los `zombies` que recibe update() son los
// vecinos (para la separación); basta con que expongan `position/radius/alive`.
import { enemyHpMult, enemySpeedAdd, enemyDamageMult } from '../systems/shared.js';

/**
 * Tipos de enemigo (datos puros; el campo `model`/`targetH` lo usa la vista).
 *  - walker: zombie (equilibrado).  - runner: esqueleto (rápido y frágil).
 *  - tank: fantasma (lento, mucha vida, flota).  - boss: gigante con ataque a distancia.
 */
export const ZOMBIE_TYPES = {
  walker: { model: 'zombie', targetH: 1.7, radius: 0.5, hp: 60, speed: 2.0, damage: 10, score: 10 },
  runner: { model: 'skeleton', targetH: 1.6, radius: 0.4, hp: 45, speed: 3.9, damage: 8, score: 15 },
  tank: { model: 'ghost', targetH: 2.3, radius: 0.85, hp: 200, speed: 1.25, damage: 22, score: 30, floats: true },
  boss: { model: 'zombie', targetH: 3.7, radius: 1.5, hp: 1200, speed: 1.7, damage: 35, score: 250, ranged: true },
};

export default class ZombieSim {
  constructor(world, type, x, z, wave, hpMult = 1) {
    this.world = world;
    this.type = type;
    const def = ZOMBIE_TYPES[type];

    this.radius = def.radius;
    this.alive = true;
    this.speed = def.speed + enemySpeedAdd(wave);
    this.maxHp = Math.round(def.hp * enemyHpMult(wave) * hpMult);
    this.hp = this.maxHp;
    this.damage = Math.round(def.damage * enemyDamageMult(wave));
    this.score = def.score;
    this.isBoss = type === 'boss';
    this.ranged = !!def.ranged;
    this.floats = !!def.floats;
    this.fireCooldown = 2.5;
    this.baseY = this.floats ? 0.7 : 0; // altura de reposo del modelo sobre el suelo
    this.facing = 0;                     // yaw (orienta el modelo)
    this.vy = 0;

    // Aparición "desenterrándose" (walkers/runners): empiezan bajo tierra y suben.
    this.emerging = !this.floats && !this.isBoss;
    this.emergeTime = 1.2;
    this.emergeT = 0;
    this.buriedY = -(def.targetH + 0.3);
    this.dying = false;
    this.deathTimer = 0;

    this.y = this.emerging ? this.buriedY : 0; // altura del suelo donde está
    this.position = { x, y: this.y, z };
  }

  update(delta, player, zombies) {
    if (!this.alive) return;
    const p = this.position;

    // Saliendo de la tierra: sube en su sitio, sin moverse ni atacar.
    if (this.emerging) {
      this.emergeT += delta;
      const t = Math.min(1, this.emergeT / this.emergeTime);
      this.y = this.buriedY * (1 - t);
      p.y = this.y;
      if (t >= 1) { this.emerging = false; this.y = 0; p.y = 0; }
      return;
    }

    const level = this.y > 1.3 ? 1 : 0;
    const flow = this.world.nav.flowDir(p, level, player.position);

    // Separación de los vecinos (empuje inverso a la distancia).
    let sx = 0;
    let sz = 0;
    for (const other of zombies) {
      if (other.position === p || !other.alive) continue; // salta a sí mismo y a muertos
      const op = other.position;
      const dx = p.x - op.x;
      const dz = p.z - op.z;
      const d2 = dx * dx + dz * dz;
      const range = (this.radius + other.radius) * 1.4;
      if (d2 > 0 && d2 < range * range) { sx += dx / d2; sz += dz / d2; }
    }

    const vx = flow.x + sx * 0.5;
    const vz = flow.z + sz * 0.5;
    const len = Math.hypot(vx, vz) || 1;
    const nx = vx / len;
    const nz = vz / len;
    p.x += nx * this.speed * delta;
    p.z += nz * this.speed * delta;

    this.world.walls.resolveCircle(p, this.radius, this.y, 1.6);
    this.world.clampToWorld(p, this.radius);

    // Verticalidad: sube por rampas/escaleras, cae por los bordes (como el jugador).
    const support = this.world.supportHeight(p.x, p.z, this.y);
    if (this.y <= support + 0.02) {
      this.y = support;
      this.vy = 0;
    } else {
      this.vy -= 22 * delta;
      this.y += this.vy * delta;
      if (this.y < support) { this.y = support; this.vy = 0; }
    }
    p.y = this.y;

    this.facing = Math.atan2(nx, nz);

    // Ataque a distancia (jefe): ráfaga de 3 escupitajos hacia el jugador.
    if (this.ranged) {
      this.fireCooldown -= delta;
      const dToPlayer = Math.hypot(player.position.x - p.x, player.position.z - p.z);
      if (this.fireCooldown <= 0 && dToPlayer < 26) {
        const base = Math.atan2(player.position.x - p.x, player.position.z - p.z);
        for (let i = -1; i <= 1; i += 1) {
          const ang = base + i * 0.18;
          this.world.spawnEnemyBullet(p, Math.sin(ang), Math.cos(ang), this.damage * 0.5, player.position.y + 1.0);
        }
        this.fireCooldown = 2.6;
      }
    }
  }

  /** Aplica daño. Devuelve true si muere (hp <= 0). */
  hurt(amount) {
    this.hp -= amount;
    return this.hp <= 0;
  }

  /** Inicia la muerte (estado). El clip/tumbado y el desvanecido los hace la vista. */
  die() {
    this.alive = false;
    this.dying = true;
    this.emerging = false;
    this.deathTimer = 5;
  }

  /** Cuenta atrás del cadáver (5 s). La vista lo desvanece al final. */
  updateCorpse(delta) {
    this.deathTimer -= delta;
  }
}
