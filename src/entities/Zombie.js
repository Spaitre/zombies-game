import * as THREE from 'three';
import ZombieSim, { ZOMBIE_TYPES } from '../sim/ZombieSim.js';
import { MODEL_FACE_OFFSET } from '../Models.js';

export { ZOMBIE_TYPES };

/**
 * VISTA (render) del enemigo. La lógica (IA, movimiento, verticalidad, ataque,
 * muerte) vive en `ZombieSim` (sin Three.js); esta clase crea el modelo/mesh y sus
 * animaciones, y las sincroniza desde el estado de la sim cada frame. La rotación,
 * el bob/flotado, el forcejeo al emerger, el flash de daño y el clip de muerte son
 * puramente visuales. Patrón estado+vista (ver README "Separación lógica ↔ render").
 */
export default class Zombie {
  constructor(game, type, x, z, wave, hpMult = 1) {
    this.game = game;
    this.sim = new ZombieSim(game, type, x, z, wave, hpMult);
    const def = ZOMBIE_TYPES[type];
    this.walkPhase = Math.random() * Math.PI * 2; // fase del bob (visual)

    const model = game.models.get(def.model);
    const size = game.models.size(def.model);
    model.scale.setScalar(def.targetH / size.y);
    model.rotation.y = MODEL_FACE_OFFSET;
    model.position.y = this.sim.baseY;
    this.model = model;
    this.mats = model.userData.mats || [];

    if (this.sim.floats) {
      for (const m of this.mats) { m.transparent = true; m.opacity = 0.6; }
    }

    // Animación de esqueleto del .glb (runners corren; el resto camina).
    this.mixer = null;
    const clips = model.userData.animations || [];
    this.clips = clips; // para reproducir 'die' al morir
    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const wanted = def.speed >= 3.5 ? 'sprint' : 'walk';
      const clip = THREE.AnimationClip.findByName(clips, wanted)
        || THREE.AnimationClip.findByName(clips, 'walk')
        || clips[0];
      const action = this.mixer.clipAction(clip);
      action.play();
      action.time = Math.random() * clip.duration; // desfase para no marchar sincronizados
      this.mixer.timeScale = THREE.MathUtils.clamp(this.sim.speed / 2.2, 0.85, 2.4);
    }

    this.mesh = new THREE.Group();
    this.mesh.add(model);
    const p = this.sim.position;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.userData.zombie = this; // para que el raycast de armas lo identifique
    game.scene.add(this.mesh);
  }

  // Estado reexpuesto para que el resto del código (colisiones, HUD, economía) no cambie.
  get position() { return this.sim.position; }
  get radius() { return this.sim.radius; }
  get damage() { return this.sim.damage; }
  get hp() { return this.sim.hp; }
  get maxHp() { return this.sim.maxHp; }
  get score() { return this.sim.score; }
  get isBoss() { return this.sim.isBoss; }
  get emerging() { return this.sim.emerging; }
  get dying() { return this.sim.dying; }
  get deathTimer() { return this.sim.deathTimer; }
  get alive() { return this.sim.alive; }
  set alive(v) { this.sim.alive = v; }

  update(delta, player, zombies) {
    if (!this.sim.alive) return;
    const wasEmerging = this.sim.emerging;
    this.sim.update(delta, player, zombies);

    const p = this.sim.position;
    this.mesh.position.set(p.x, p.y, p.z);

    // Forcejeo visual mientras (o el frame en que acaba de) emerger.
    if (wasEmerging) {
      if (this.mixer) this.mixer.update(delta);
      if (this.sim.emerging) {
        const t = Math.min(1, this.sim.emergeT / this.sim.emergeTime);
        this.model.rotation.z = Math.sin(this.sim.emergeT * 22) * 0.14 * (1 - t);
      } else {
        this.model.rotation.z = 0; // acaba de salir
      }
      return;
    }

    this.mesh.rotation.y = this.sim.facing;

    if (this.mixer) {
      this.mixer.update(delta);
      this.model.position.y = this.sim.baseY;
      if (this.sim.floats) {
        this.walkPhase += delta * 2.5;
        this.model.position.y += Math.sin(this.walkPhase) * 0.1;
      }
    } else {
      // Fallback sin animación: balanceo + bob (modelo rígido).
      this.walkPhase += delta * (4 + this.sim.speed);
      const amp = this.sim.floats ? 0.14 : 0.07;
      this.model.position.y = this.sim.baseY + Math.abs(Math.sin(this.walkPhase)) * amp;
      this.model.rotation.z = Math.sin(this.walkPhase) * 0.06;
    }
  }

  hurt(amount) {
    const dead = this.sim.hurt(amount);
    for (const m of this.mats) m.emissive = new THREE.Color(0xff4444);
    setTimeout(() => {
      if (this.sim.alive) for (const m of this.mats) m.emissive = new THREE.Color(0x000000);
    }, 60);
    return dead;
  }

  /** Inicia la muerte: estado en la sim + clip 'die' (o tumbar el modelo). */
  die() {
    this.sim.die();
    for (const m of this.mats) { m.transparent = true; m.needsUpdate = true; }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.timeScale = 1;
      const dieClip = THREE.AnimationClip.findByName(this.clips || [], 'die');
      if (dieClip) {
        const act = this.mixer.clipAction(dieClip);
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
        act.reset();
        act.play();
      } else {
        this.model.rotation.x = -Math.PI / 2; // fallback: tumbar el modelo
      }
    } else {
      this.model.rotation.x = -Math.PI / 2;
    }
  }

  /** Avanza el temporizador del cadáver (sim) y lo desvanece al final (vista). */
  updateCorpse(delta) {
    this.sim.updateCorpse(delta);
    if (this.mixer) this.mixer.update(delta);
    if (this.sim.deathTimer < 0.7) {
      const a = Math.max(0, this.sim.deathTimer / 0.7);
      const base = this.sim.floats ? 0.6 : 1;
      for (const m of this.mats) m.opacity = base * a;
    }
  }

  destroy() {
    this.sim.alive = false;
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.mixer = null;
    }
    this.game.scene.remove(this.mesh);
    for (const m of this.mats) m.dispose();
  }
}
