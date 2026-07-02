// Simulación PURA del proyectil enemigo (escupitajo del jefe): sin Three.js.
// Estado en vectores planos {x,y,z}. Depende de la interfaz `world` (en el
// cliente la cumple `Game`): isInWorld({x,y,z}) y walls.blocksPoint(...).

const LIFETIME = 3.5; // seg
const RADIUS = 0.24;

export default class EnemyBulletSim {
  constructor(world, origin, dir, speed, damage) {
    this.world = world;
    this.radius = RADIUS;
    this.damage = damage;
    this.alive = true;
    this.life = LIFETIME;

    this.position = { x: origin.x, y: origin.y, z: origin.z };
    // Vuela en horizontal (y = 0): normaliza dir en XZ y aplica la velocidad.
    const len = Math.hypot(dir.x, dir.z) || 1;
    const s = speed / len;
    this.velocity = { x: dir.x * s, y: 0, z: dir.z * s };
  }

  update(delta) {
    const p = this.position;
    p.x += this.velocity.x * delta;
    p.y += this.velocity.y * delta;
    p.z += this.velocity.z * delta;
    this.life -= delta;
    if (this.life <= 0 || !this.world.isInWorld(p)
      || this.world.walls.blocksPoint(p, this.radius, p.y - 0.1, 0.2)) {
      this.alive = false;
    }
  }
}
