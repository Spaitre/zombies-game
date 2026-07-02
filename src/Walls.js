import * as THREE from 'three';

const EPS = 0.05;

/**
 * Contenedor de obstáculos del mapa (cajas AABB en el plano XZ, con rango de
 * altura [y0, y1]). Una caja solo bloquea a un cuerpo cuyo tramo vertical
 * solape su [y0, y1]; así una pared de la planta baja no estorba al jugador
 * que camina por el segundo piso, y una barandilla solo bloquea arriba.
 *  - resolveCircle: empuja un círculo (jugador/zombie) fuera de los obstáculos.
 *  - blocksPoint: si un punto (bala/celda de navegación) cae dentro.
 */
export default class Walls {
  constructor() {
    this.boxes = []; // { cx, cz, hx, hz, y0, y1 }
    this.meshes = []; // objetos para raycast de cámara
  }

  addBox(cx, cz, hx, hz, y0 = 0, y1 = Infinity) {
    this.boxes.push({ cx, cz, hx, hz, y0, y1 });
  }

  addMesh(obj) {
    this.meshes.push(obj);
  }

  /** ¿La caja b solapa verticalmente el cuerpo [bottom, top]? */
  static vOverlap(b, bottom, top) {
    return b.y0 < top - EPS && b.y1 > bottom + EPS;
  }

  /** Empuja el círculo (pos, r) fuera de toda caja que penetre a su altura. */
  resolveCircle(pos, r, footY = 0, height = 1.8) {
    const bottom = footY;
    const top = footY + height;
    for (const b of this.boxes) {
      if (!Walls.vOverlap(b, bottom, top)) continue;
      const nx = THREE.MathUtils.clamp(pos.x, b.cx - b.hx, b.cx + b.hx);
      const nz = THREE.MathUtils.clamp(pos.z, b.cz - b.hz, b.cz + b.hz);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          const penX = b.hx + r - Math.abs(pos.x - b.cx);
          const penZ = b.hz + r - Math.abs(pos.z - b.cz);
          if (penX < penZ) pos.x += pos.x < b.cx ? -penX : penX;
          else pos.z += pos.z < b.cz ? -penZ : penZ;
        }
      }
    }
  }

  /** ¿El punto (con margen r) cae dentro de alguna caja a la altura dada? */
  blocksPoint(pos, r = 0.1, footY = 0, height = 1.8) {
    const bottom = footY;
    const top = footY + height;
    for (const b of this.boxes) {
      if (!Walls.vOverlap(b, bottom, top)) continue;
      if (
        pos.x > b.cx - b.hx - r && pos.x < b.cx + b.hx + r
        && pos.z > b.cz - b.hz - r && pos.z < b.cz + b.hz + r
      ) return true;
    }
    return false;
  }
}
