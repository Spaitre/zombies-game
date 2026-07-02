// Verticalidad: registro de plataformas/rampas, fundido de tejados y alturas de
// apoyo. Mixin de Game (`this` = instancia de Game).
import * as THREE from 'three';

export default {
  /**
   * Registra una superficie transitable. Plana: { minX,maxX,minZ,maxZ, top }.
   * Rampa: además { ramp: { axis:'x'|'z', lowAt, highAt, lowTop, highTop } }.
   */
  registerPlatform(p) {
    this.platforms.push(p);
  },

  /** Registra los materiales superiores de una casa (tejado/muros 2º piso) que
   *  se FUNDEN cuando el jugador sube a su loft, para no tapar la cámara. */
  registerRoof(r) {
    r.cur = 1;
    this.roofs.push(r);
  },

  updateRoofFade(delta) {
    const p = this.player.position;
    const up = p.y > 1.2;
    for (const r of this.roofs) {
      const inside = up && p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
      const target = inside ? 0 : 1; // se desvanece por completo (suave) para no tapar la cámara
      r.cur += (target - r.cur) * Math.min(1, delta * 9);
      // Los materiales ya son transparent:true; solo variamos opacity (sin
      // recompilar). depthWrite solo cuando está casi opaco para que ocluya bien.
      const solid = r.cur > 0.985;
      for (const m of r.mats) {
        m.opacity = r.cur;
        m.depthWrite = solid;
      }
    }
  },

  /** Altura (top) de la plataforma p en (x,z), o null si el punto cae fuera. */
  platformTop(p, x, z) {
    if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return null;
    if (!p.ramp) return p.top;
    const r = p.ramp;
    const a = r.axis === 'x' ? x : z;
    const u = THREE.MathUtils.clamp((a - r.lowAt) / (r.highAt - r.lowAt), 0, 1);
    return r.lowTop + (r.highTop - r.lowTop) * u;
  },

  /**
   * Altura de apoyo en (x,z) para un cuerpo que está a curY: la plataforma más
   * alta que no quede por encima del alcance de escalón (STEP). Así caminar
   * bajo una losa no te sube a ella; subes por rampas/escaleras.
   */
  supportHeight(x, z, curY) {
    const STEP = 0.7;
    let best = 0; // suelo
    for (const p of this.platforms) {
      const t = this.platformTop(p, x, z);
      if (t === null) continue;
      if (t <= curY + STEP && t > best) best = t;
    }
    return best;
  },
};
