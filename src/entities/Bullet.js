import * as THREE from 'three';
import BulletSim from '../sim/BulletSim.js';

const BULLET_GEO = new THREE.SphereGeometry(0.16, 8, 8);
const GRENADE_GEO = new THREE.SphereGeometry(0.26, 10, 10);

/**
 * VISTA (render) de un proyectil. La lógica vive en `BulletSim` (sin Three.js,
 * apta para servidor headless); esta clase solo crea el mesh y lo sincroniza
 * desde el estado de simulación cada frame. Es el proof-of-concept del patrón
 * estado+vista para el multijugador (ver README "Separación lógica ↔ render").
 *
 * Reexpone el estado del sim (position/radius/damage/kind/alive) para que el
 * resto del código (colisiones, filtros) siga funcionando igual.
 */
export default class Bullet {
  constructor(game, origin, dir, weapon, damage) {
    this.game = game;
    this.sim = new BulletSim(game, origin, dir, weapon, damage);

    this.material = new THREE.MeshStandardMaterial({
      color: weapon.color, emissive: weapon.color, emissiveIntensity: 0.8,
    });
    const geo = this.sim.kind === 'grenade' ? GRENADE_GEO : BULLET_GEO;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.syncView();
    game.scene.add(this.mesh);
  }

  // La lógica opera sobre el estado de simulación (vectores planos {x,y,z}).
  get position() { return this.sim.position; }
  get radius() { return this.sim.radius; }
  get damage() { return this.sim.damage; }
  get kind() { return this.sim.kind; }
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

  onHit() { this.sim.onHit(); }

  destroy() {
    this.sim.alive = false;
    this.game.scene.remove(this.mesh);
    this.material.dispose();
  }
}
