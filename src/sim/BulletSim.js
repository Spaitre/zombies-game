// Simulación PURA de un proyectil: sin Three.js, apta para correr en un servidor
// headless (multijugador). El estado (posición/velocidad) son vectores planos
// {x,y,z}. Depende de un `world` (interfaz), no del render.
//
// Interfaz `world` que necesita (en el cliente la cumple `Game`; en el servidor
// la cumpliría el mundo del servidor):
//   - supportHeight(x, z, curY) -> número   (altura de apoyo suelo/plataforma)
//   - isInWorld({x,y,z}) -> bool
//   - walls.blocksPoint({x,y,z}, radius, y0, height) -> bool
//   - explode({x,y,z}, radius, damage)               (granada: daño en área)

const LIFETIME = 1.8; // seg
const BULLET_RADIUS = 0.16;
const GRENADE_RADIUS = 0.26;

export default class BulletSim {
  constructor(world, origin, dir, weapon, damage) {
    this.world = world;
    this.kind = weapon.kind;
    this.damage = damage ?? weapon.damage;
    this.explodeRadius = weapon.explodeRadius || 0;
    this.radius = this.kind === 'grenade' ? GRENADE_RADIUS : BULLET_RADIUS;
    this.gravity = weapon.gravity || 0; // caída de bala (0 = trayectoria recta)
    this.alive = true;
    this.life = LIFETIME;

    // Estado puro (sin THREE): posición y velocidad como vectores planos.
    this.position = { x: origin.x, y: origin.y, z: origin.z };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const s = weapon.speed / len; // normaliza dir y aplica la velocidad del arma
    this.velocity = { x: dir.x * s, y: dir.y * s, z: dir.z * s };
  }

  update(delta) {
    if (this.gravity) this.velocity.y -= this.gravity * delta; // arco balístico
    const p = this.position;
    p.x += this.velocity.x * delta;
    p.y += this.velocity.y * delta;
    p.z += this.velocity.z * delta;
    this.life -= delta;

    // Caída de bala: al posarse en el suelo/plataforma, explota ahí.
    if (this.gravity && this.velocity.y < 0) {
      const support = this.world.supportHeight(p.x, p.z, p.y);
      if (p.y <= support + 0.1) { p.y = support; this.expire(); return; }
    }

    const blockedByWall = this.world.walls.blocksPoint(p, this.radius, p.y - 0.1, 0.2);
    if (this.life <= 0 || !this.world.isInWorld(p) || blockedByWall) {
      this.expire();
    }
  }

  /** Fin de vida (pared/límite/tiempo/suelo o impacto). Las granadas explotan. */
  expire() {
    if (this.kind === 'grenade') {
      const p = this.position;
      this.world.explode({ x: p.x, y: p.y, z: p.z }, this.explodeRadius, this.damage);
    }
    this.alive = false;
  }

  /** Impacto directo contra un enemigo (lo llama la resolución de colisiones). */
  onHit() { this.expire(); }
}
