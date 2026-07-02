import * as THREE from 'three';
import EnemyBulletSim from '../sim/EnemyBulletSim.js';

const GEO = new THREE.SphereGeometry(0.24, 8, 8);

/**
 * VISTA (render) del proyectil enemigo. La lógica vive en `EnemyBulletSim` (sin
 * Three.js); esta clase solo crea el mesh y lo sincroniza desde `sim.position`.
 * Patrón estado+vista (ver README "Separación lógica ↔ render").
 */
export default class EnemyBullet {
  constructor(game, origin, dir, speed, damage) {
    this.game = game;
    this.sim = new EnemyBulletSim(game, origin, dir, speed, damage);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xab47bc, emissive: 0x7b1fa2, emissiveIntensity: 0.9,
    });
    this.mesh = new THREE.Mesh(GEO, this.material);
    this.syncView();
    game.scene.add(this.mesh);
  }

  get position() { return this.sim.position; }
  get radius() { return this.sim.radius; }
  get damage() { return this.sim.damage; }
  get alive() { return this.sim.alive; }
  set alive(v) { this.sim.alive = v; }

  update(delta) {
    this.sim.update(delta);
    this.syncView();
  }

  /** Paso de render: copia la posición del estado de simulación al mesh. */
  syncView() {
    const p = this.sim.position;
    this.mesh.position.set(p.x, p.y, p.z);
  }

  destroy() {
    this.sim.alive = false;
    this.game.scene.remove(this.mesh);
    this.material.dispose();
  }
}
