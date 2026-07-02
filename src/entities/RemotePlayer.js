import * as THREE from 'three';
import { MODEL_FACE_OFFSET } from '../Models.js';

const TARGET_HEIGHT = 1.85;

/**
 * Compañero de sala (co-op): representación visual de otro jugador, sincronizada
 * desde la red. Sin lógica de juego — solo interpola posición/orientación hacia
 * el último estado recibido (los enemigos NO lo persiguen en la Fase 1).
 */
export default class RemotePlayer {
  constructor(game, id, name) {
    this.game = game;
    this.id = id;
    this.name = name || `Jugador ${id}`;

    const model = game.models.get('keeper');
    const size = game.models.size('keeper');
    model.scale.setScalar(TARGET_HEIGHT / size.y);
    model.rotation.y = MODEL_FACE_OFFSET;
    this.model = model;

    // Tinte para distinguirlo del jugador local.
    for (const m of (model.userData.mats || [])) m.color.offsetHSL(0.45, 0, 0);

    this.mesh = new THREE.Group();
    this.mesh.add(model);
    this.mesh.position.set(0, 0, 0);
    game.scene.add(this.mesh);

    this.target = { x: 0, y: 0, z: 0, f: 0 };
    this.hasState = false;
  }

  /** Último estado recibido por red. */
  setState(s) {
    this.target.x = s.x; this.target.y = s.y; this.target.z = s.z; this.target.f = s.f;
    if (!this.hasState) { // primer estado: colocar sin interpolar
      this.mesh.position.set(s.x, s.y, s.z);
      this.mesh.rotation.y = s.f;
      this.hasState = true;
    }
  }

  /** Interpola suavemente hacia el último estado (suaviza el relé de red). */
  update(delta) {
    if (!this.hasState) return;
    const k = Math.min(1, delta * 12);
    const p = this.mesh.position;
    p.x += (this.target.x - p.x) * k;
    p.y += (this.target.y - p.y) * k;
    p.z += (this.target.z - p.z) * k;
    let d = this.target.f - this.mesh.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.mesh.rotation.y += d * k;
  }

  destroy() {
    this.game.scene.remove(this.mesh);
  }
}
