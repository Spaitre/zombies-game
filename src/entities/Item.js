import * as THREE from 'three';
import ItemSim from '../sim/ItemSim.js';

const HEAL_GEO = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const CRATE_GEO = new THREE.BoxGeometry(0.7, 0.7, 0.7);
const COIN_GEO = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16);

// Valor → color de la moneda.
const COIN_COLORS = {
  1: 0xb87333,  // cobre
  5: 0xc8ccd6,  // plata
  10: 0xffd54a, // dorado
  25: 0xff2e2e, // rojo (solo el jefe, BOSS_COIN_VALUE)
};

/**
 * VISTA (render) de un recogible. La lógica (imán, efecto al recoger) vive en
 * `ItemSim` (sin Three.js); esta clase crea el mesh, lo sincroniza desde
 * `sim.position` y le añade el flotado/rotación visual. Patrón estado+vista
 * (ver README "Separación lógica ↔ render").
 *
 * Tipos: 'health' (vida), 'weapon' (equipa un arma), 'coin' (dinero, con imán).
 */
export default class Item {
  constructor(game, type, x, z, payload = null) {
    this.game = game;
    this.sim = new ItemSim(game, type, x, z, payload);
    this.t = Math.random() * Math.PI * 2;

    let color;
    let geo;
    if (type === 'coin') {
      color = COIN_COLORS[payload] || 0xffd54a;
      geo = COIN_GEO;
      this.material = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.3,
      });
    } else {
      color = type === 'health' ? 0xff5252 : 0xffd54f;
      geo = type === 'health' ? HEAL_GEO : CRATE_GEO;
      this.material = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4,
      });
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.syncView();
    game.scene.add(this.mesh);
  }

  get position() { return this.sim.position; }
  get type() { return this.sim.type; }
  get value() { return this.sim.value; }
  get radius() { return this.sim.radius; }
  get alive() { return this.sim.alive; }
  set alive(v) { this.sim.alive = v; }
  get baseY() { return this.sim.baseY; }
  set baseY(v) { this.sim.baseY = v; this.sim.position.y = v; }

  update(delta) {
    this.sim.update(delta); // lógica (imán de la moneda)
    this.t += delta;
    this.mesh.rotation.y += delta * (this.sim.type === 'coin' ? 2.6 : 1.6);
    this.syncView();
  }

  /** Paso de render: posición del estado + flotado visual sobre baseY. */
  syncView() {
    const p = this.sim.position;
    const bob = this.sim.type === 'coin' ? Math.sin(this.t * 4) * 0.08 : Math.sin(this.t * 3) * 0.12;
    this.mesh.position.set(p.x, p.y + bob, p.z);
  }

  apply(player) { return this.sim.apply(player); }

  destroy() {
    this.sim.alive = false;
    this.game.scene.remove(this.mesh);
    this.material.dispose();
  }
}
