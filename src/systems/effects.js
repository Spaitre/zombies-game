// Efectos visuales de corta vida: fogonazo, sangre, explosión y su actualización.
// Mixin de Game (`this` = instancia de Game).
import * as THREE from 'three';
import { rand } from './shared.js';

export default {
  spawnMuzzleFlash(pos) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mat);
    flash.position.copy(pos);
    this.scene.add(flash);
    this.effects.push({ mesh: flash, life: 0.08, maxLife: 0.08, vel: null, shrink: true });
  },

  spawnBlood(pos) {
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8e0000, transparent: true });
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat);
      p.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const sp = rand(2, 5);
      this.scene.add(p);
      this.effects.push({
        mesh: p, life: 0.45, maxLife: 0.45,
        vel: new THREE.Vector3(Math.cos(a) * sp, rand(2, 5), Math.sin(a) * sp), shrink: false,
      });
    }
  },

  spawnExplosion(pos, radius) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.effects.push({ mesh: m, life: 0.3, maxLife: 0.3, vel: null, grow: radius });
    this.shake = Math.max(this.shake, 0.5);
  },

  updateEffects(delta) {
    for (const e of this.effects) {
      e.life -= delta;
      const t = Math.max(0, e.life / e.maxLife);
      e.mesh.material.opacity = t;
      if (e.vel) {
        e.mesh.position.addScaledVector(e.vel, delta);
        e.vel.y -= 14 * delta;
      }
      if (e.shrink) e.mesh.scale.setScalar(t);
      if (e.grow) e.mesh.scale.setScalar(Math.max(0.001, e.grow * (1 - t)));
    }
    this.effects = this.effects.filter((e) => {
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        if (e.disposeOnEnd) { e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
        return false;
      }
      return true;
    });
  },
};
