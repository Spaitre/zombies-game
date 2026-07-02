import * as THREE from 'three';
import PlayerSim, { PLAYER_MAX_HP } from '../sim/PlayerSim.js';
import { HIP_SPREAD } from '../systems/shared.js';
import { MODEL_FACE_OFFSET } from '../Models.js';

export { PLAYER_MAX_HP };

const TARGET_HEIGHT = 1.85;

const _origin = new THREE.Vector3(); // temporal para el fogonazo (efecto de render)

const KEY_TO_WEAPON = { Digit1: 'pistol', Digit2: 'shotgun', Digit3: 'rifle', Digit4: 'grenade' };

/**
 * VISTA (render) del jugador. La lógica de juego (movimiento, verticalidad,
 * munición, daño, mejoras) vive en `PlayerSim` (sin Three.js). Esta clase crea el
 * modelo/arma/animaciones, recoge la entrada local (cámara, teclado, ratón) y la
 * pasa "digerida" a la sim, y sincroniza el render desde el estado. El apuntado por
 * cámara (`aim`) y el disparo (muzzle/`aimPoint`) siguen aquí: son el próximo seam
 * (intención de disparo por red). Patrón estado+vista (ver README).
 */
export default class Player {
  constructor(game) {
    this.game = game;
    this.sim = new PlayerSim(game);

    // Estado puramente visual/de entrada.
    this.aimPoint = new THREE.Vector3(0, 1, 5); // punto 3D bajo la retícula (cámara)
    this.walkPhase = 0;
    this.walkIntensity = 0;
    this.moveBlend = 0;
    this.shootBlend = 0;
    this.shootTimer = 0;
    this.gunRecoil = 0;   // retroceso visual del arma (atrás/arriba)
    this.gunKickYaw = 0;  // desviación horizontal del arma por disparo
    this._reloadKeyDown = false;

    // Modelo keeper (Kenney). Origen en los pies (y=0).
    const model = game.models.get('keeper');
    const size = game.models.size('keeper');
    model.scale.setScalar(TARGET_HEIGHT / size.y);
    model.rotation.y = MODEL_FACE_OFFSET;
    this.model = model;
    this.mats = model.userData.mats || [];

    // Animaciones de esqueleto: correr al moverse, disparar al fuego.
    this.anim = null;
    const clips = model.userData.animations || [];
    if (clips.length) {
      const mixer = new THREE.AnimationMixer(model);
      const find = (...names) => {
        for (const n of names) {
          const c = THREE.AnimationClip.findByName(clips, n);
          if (c) return c;
        }
        return null;
      };
      const mk = (clip, loop = true) => {
        if (!clip) return null;
        const act = mixer.clipAction(clip);
        if (!loop) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
        act.play();
        act.setEffectiveWeight(0);
        return act;
      };
      const idle = mk(find('holding-right', 'idle'));
      const run = mk(find('sprint', 'walk'));
      const shoot = mk(find('holding-right-shoot', 'holding-both-shoot', 'attack-melee-right'), false);
      if (run) run.setEffectiveTimeScale(1.25);
      if (idle) idle.setEffectiveWeight(1);
      this.anim = { mixer, idle, run, shoot };
    }

    this.mesh = new THREE.Group();
    this.mesh.add(model);

    // Arma al frente (apunta hacia +Z local, hacia donde mira).
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.78),
      new THREE.MeshStandardMaterial({ color: 0x222a2e, roughness: 0.5 }),
    );
    gun.position.set(0.26, 0.8, 0.32);
    gun.castShadow = true;
    this.mesh.add(gun);
    this.gun = gun;

    const p = this.sim.position;
    this.mesh.position.set(p.x, p.y, p.z);
    game.scene.add(this.mesh);
  }

  // Estado reexpuesto (colisiones, HUD, tienda, items leen/escriben el jugador).
  get position() { return this.sim.position; }
  get radius() { return this.sim.radius; }
  get hp() { return this.sim.hp; }
  set hp(v) { this.sim.hp = v; }
  get maxHp() { return this.sim.maxHp; }
  get weapon() { return this.sim.weapon; }
  set weapon(v) { this.sim.weapon = v; }
  get ammo() { return this.sim.ammo; }
  get reloading() { return this.sim.reloading; }
  get owned() { return this.sim.owned; }
  get weaponUpgrades() { return this.sim.weaponUpgrades; }
  get playerUpgrades() { return this.sim.playerUpgrades; }
  get aimBlend() { return this.sim.aimBlend; }
  get isMoving() { return this.sim.isMoving; }

  effWeapon(key) { return this.sim.effWeapon(key); }
  heal(amount) { this.sim.heal(amount); }
  applyMaxHpUpgrade() { this.sim.applyMaxHpUpgrade(); }

  /** Recoge la INTENCIÓN de apuntado del cliente (cámara/joystick) y la pasa a la
   *  sim: `aimDir` (dir horizontal) y `aimPoint` (punto 3D bajo la mira). La sim
   *  calcula el cañón y la dirección exacta del disparo a partir de esto. */
  aim() {
    const ta = this.game.input.touchAim;
    if (ta) {
      const yaw = this.game.camYaw;
      const ax = Math.sin(yaw) * -ta.z + -Math.cos(yaw) * ta.x;
      const az = Math.cos(yaw) * -ta.z + Math.sin(yaw) * ta.x;
      if (ax !== 0 || az !== 0) { const l = Math.hypot(ax, az); this.sim.aimDir.x = ax / l; this.sim.aimDir.z = az / l; }
      // Intención: un punto lejano al frente (para la sim y para orientar el arma).
      const s = this.sim.position;
      const d = this.sim.aimDir;
      this.aimPoint.set(s.x + d.x * 20, s.y + 1, s.z + d.z * 20);
      this._syncAimPoint();
      return;
    }
    // Punto 3D bajo la retícula (raycast a la escena). La bala irá ahí.
    this.game.crosshairTarget(this.aimPoint);
    let dx = this.aimPoint.x - this.sim.position.x;
    let dz = this.aimPoint.z - this.sim.position.z;
    if (dx * dx + dz * dz < 0.0001) { const yaw = this.game.camYaw; dx = Math.sin(yaw); dz = Math.cos(yaw); }
    const l = Math.hypot(dx, dz) || 1;
    this.sim.aimDir.x = dx / l;
    this.sim.aimDir.z = dz / l;
    this._syncAimPoint();
  }

  /** Copia el punto de mira (Vector3 de la vista) al estado de la sim (intención). */
  _syncAimPoint() {
    this.sim.aimPoint.x = this.aimPoint.x;
    this.sim.aimPoint.y = this.aimPoint.y;
    this.sim.aimPoint.z = this.aimPoint.z;
  }

  /** Recoge la entrada, avanza la simulación y sincroniza el render. */
  move(delta) {
    // Derribado (co-op): tumbado en el suelo, sin moverse ni animar.
    if (this.sim.downed) {
      const p = this.sim.position;
      this.mesh.position.set(p.x, p.y, p.z);
      this.model.rotation.x = -Math.PI / 2;
      return;
    }
    if (this.model.rotation.x !== 0) this.model.rotation.x = 0; // reanimado: en pie

    const aiming = this.game.input.aimDown || !!this.game.input.touchAim;

    // Dirección de movimiento en mundo (relativa a la cámara).
    const mv = this.game.input.moveVector();
    let moveDir = null;
    if (mv.x !== 0 || mv.z !== 0) {
      const yaw = this.game.camYaw;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const dx = fwdX * -mv.z + rightX * mv.x; // W adelante, D derecha
      const dz = fwdZ * -mv.z + rightZ * mv.x;
      const len = Math.hypot(dx, dz);
      if (len > 0) moveDir = { x: dx / len, z: dz / len };
    }
    const jump = this.game.input.keys.has('Space') || this.game.input.touchJump;

    this.sim.move(delta, moveDir, aiming, jump);

    // Sincroniza el render desde el estado de simulación.
    const p = this.sim.position;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.rotation.y = this.sim.facing;
    if (this.sim.isMoving) this.walkPhase += delta * 11;

    if (this.anim) {
      this.updateAnimation(delta, this.sim.isMoving);
    } else {
      // Fallback sin animación (modelo rígido): bob + balanceo.
      this.walkIntensity += ((this.sim.isMoving ? 1 : 0) - this.walkIntensity) * Math.min(1, delta * 12);
      this.model.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.walkIntensity;
      this.model.rotation.z = Math.sin(this.walkPhase) * 0.05 * this.walkIntensity;
    }

    this.updateGun(delta);
  }

  /** Capa procedural de apuntado: torso/cabeza giran al objetivo y brazos se elevan. */
  applyAimPose() {
    const ab = this.sim.aimBlend;
    if (ab < 0.001) return;
    const torso = this._torso || (this._torso = this.model.getObjectByName('torso'));
    const head = this._head || (this._head = this.model.getObjectByName('head'));
    const armR = this._armR || (this._armR = this.model.getObjectByName('arm-right'));
    const armL = this._armL || (this._armL = this.model.getObjectByName('arm-left'));
    let residual = Math.atan2(this.sim.aimDir.x, this.sim.aimDir.z) - this.sim.facing;
    residual = Math.atan2(Math.sin(residual), Math.cos(residual));
    residual = THREE.MathUtils.clamp(residual, -1.1, 1.1);
    if (torso) torso.rotation.y += residual * 0.5 * ab;
    if (head) head.rotation.y += residual * 0.4 * ab;
    if (armR) armR.rotation.x += -1.2 * ab; // levanta el brazo del arma
    if (armL) armL.rotation.x += -0.95 * ab; // mano de apoyo
  }

  /** El arma: relajada al explorar; elevada y alineada al impacto al apuntar. */
  updateGun(delta) {
    // Primera persona: el arma es un viewmodel colgado de la cámara (abajo a la
    // derecha, apuntando al frente) con culatazo hacia atrás al disparar.
    if (this.game.firstPerson) {
      this.gunRecoil = Math.max(0, this.gunRecoil - delta * 11);
      const ab1 = this.sim.aimBlend;
      const g1 = this.gun;
      g1.position.set(
        THREE.MathUtils.lerp(0.3, 0.16, ab1),   // apuntando: más centrada
        THREE.MathUtils.lerp(-0.28, -0.2, ab1),
        -0.55 + this.gunRecoil * 0.12,
      );
      g1.rotation.set(this.gunRecoil * 0.3, Math.PI + this.gunKickYaw * this.gunRecoil, 0);
      return;
    }

    const ab = this.sim.aimBlend;
    const lerp = THREE.MathUtils.lerp;
    const g = this.gun;
    g.position.set(lerp(0.26, 0.34, ab), lerp(0.8, 1.1, ab), lerp(0.32, 0.62, ab));
    let residual = Math.atan2(this.sim.aimDir.x, this.sim.aimDir.z) - this.sim.facing;
    residual = Math.atan2(Math.sin(residual), Math.cos(residual));
    const tgt = this.aimPoint;
    const gy = this.mesh.position.y + lerp(0.8, 1.1, ab);
    const horiz = Math.hypot(tgt.x - this.mesh.position.x, tgt.z - this.mesh.position.z) || 1;
    const pitch = Math.atan2(tgt.y - gy, horiz);
    g.rotation.set(lerp(-0.65, -pitch, ab), lerp(0, residual, ab), 0);

    // Retroceso visual del arma: atrás + arriba + mínima variación horizontal.
    this.gunRecoil = Math.max(0, this.gunRecoil - delta * 11);
    g.position.z -= this.gunRecoil * 0.14;
    g.rotation.x -= this.gunRecoil * 0.28;
    g.rotation.y += this.gunKickYaw * this.gunRecoil;
  }

  /** Mezcla reposo ↔ correr y superpone el disparo cuando se acaba de disparar. */
  updateAnimation(delta, moving) {
    const a = this.anim;
    a.mixer.update(delta);
    this.moveBlend += ((moving ? 1 : 0) - this.moveBlend) * Math.min(1, delta * 10);
    this.shootTimer = Math.max(0, this.shootTimer - delta);
    const shootTarget = this.shootTimer > 0 ? 0.85 : 0;
    this.shootBlend += (shootTarget - this.shootBlend) * Math.min(1, delta * 18);
    const loco = 1 - this.shootBlend;
    if (a.idle) a.idle.setEffectiveWeight(loco * (1 - this.moveBlend));
    if (a.run) a.run.setEffectiveWeight(loco * this.moveBlend);
    if (a.shoot) a.shoot.setEffectiveWeight(this.shootBlend);
    this.model.position.y = 0;
    this.model.rotation.z = 0;
    this.applyAimPose(); // capa de apuntado encima de la locomoción
  }

  handleWeaponSwitch() {
    for (const code in KEY_TO_WEAPON) {
      if (this.game.input.keys.has(code)) this.sim.switchWeapon(KEY_TO_WEAPON[code]);
    }
  }

  /** Recarga con la tecla R (una vez por pulsación). */
  handleReload(time) {
    const down = this.game.input.keys.has('KeyR');
    if (down && !this._reloadKeyDown) this.sim.startReload(time);
    this._reloadKeyDown = down;
  }

  updateReload(time) { this.sim.updateReload(time); }

  tryFire(time) {
    const w = this.sim.effWeapon(this.sim.weapon);
    if (this.sim.reloading || this.sim.downed) return;
    // Se puede disparar SIN apuntar (desde la cadera): misma bala hacia la mira,
    // pero con dispersión extra. Apuntar (RMB) sigue siendo el modo preciso.
    if (this.game.input.firing && time > this.sim.lastFired + w.fireRate) {
      if (this.sim.ammo[this.sim.weapon] <= 0) {
        this.sim.startReload(time); // cargador vacío → recarga automática
        return;
      }
      this.fire(w);
      this.sim.ammo[this.sim.weapon] -= 1;
      this.sim.lastFired = time;
    }
  }

  fire(w) {
    // La lógica del disparo (cañón, dirección, spawn, retroceso de cámara, bloom)
    // vive en la sim; devuelve el origen para el fogonazo.
    const origin = this.sim.fire(w, this.sim.aiming ? 0 : HIP_SPREAD);

    // Efectos de cliente: retroceso visual del arma, fogonazo, audio, animación.
    this.gunRecoil = 1;
    this.gunKickYaw = (Math.random() - 0.5) * (w.recoilYaw || 0) * 6;
    _origin.set(origin.x, origin.y, origin.z);
    this.game.fx.muzzleFlash(_origin);
    this.game.fx.sound('shoot', this.sim.weapon);

    if (this.anim && this.anim.shoot) {
      this.anim.shoot.reset();
      this.anim.shoot.play();
      this.shootTimer = 0.22;
    }
  }

  takeDamage(amount, time) {
    const hit = this.sim.takeDamage(amount, time);
    if (hit) {
      for (const m of this.mats) m.emissive = new THREE.Color(0xff0000);
      setTimeout(() => { for (const m of this.mats) m.emissive = new THREE.Color(0x000000); }, 120);
    }
    return hit;
  }
}
