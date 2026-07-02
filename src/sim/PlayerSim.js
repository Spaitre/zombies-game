// Simulación PURA del jugador: movimiento, verticalidad/salto, munición/recarga,
// daño, mejoras. Sin Three.js, sin cámara ni input directo. Estado en {x,y,z}.
//
// La entrada la resuelve la vista y se la pasa ya "digerida":
//   move(delta, moveDir, aiming, jump)  — moveDir = dir de mundo {x,z} o null.
// El apuntado por cámara (aimDir) y el disparo (muzzle/aimPoint) siguen en la
// vista; ese es el siguiente seam (intención de disparo por red). Depende de la
// interfaz `world` (en el cliente `Game`): walls, clampToWorld, supportHeight, audio.
import { WEAPONS } from '../weapons.js';
import {
  WEAPON_UPGRADES, PLAYER_UPGRADES, REVIVE_TIME, REVIVE_HP_FRACT,
} from '../systems/shared.js';

export const PLAYER_MAX_HP = 100;
const BASE_SPEED = 6.5; // unidades/seg
const GRAVITY = 22;
const JUMP_V = 8; // velocidad de salto (~1.45 u de altura; no alcanza el 2º piso)

export default class PlayerSim {
  constructor(world) {
    this.world = world;
    this.radius = 0.5;
    this.lastFired = 0;
    this.invulnUntil = 0;

    // Intención de apuntado (la aporta el cliente/vista): `aimDir` = dir horizontal
    // (orienta el cuerpo) y `aimPoint` = punto 3D bajo la mira (hacia donde va la
    // bala). En red, esto es lo que enviaría el cliente; la sim calcula el cañón.
    this.aimDir = { x: 0, z: 1 };
    this.aimPoint = { x: 0, y: 1, z: 5 };

    // Mejoras por arma y de personaje (se compran con monedas; persisten).
    this.weaponUpgrades = {};
    for (const k in WEAPONS) this.weaponUpgrades[k] = { damage: 0, fireRate: 0, magSize: 0, reload: 0 };
    this.playerUpgrades = { maxHp: 0, speed: 0 };
    this.maxHp = PLAYER_MAX_HP;
    this.hp = PLAYER_MAX_HP;

    this.owned = new Set(['pistol']);
    this.weapon = 'pistol';

    this.facing = 0;     // yaw del cuerpo (rotación suave)
    this.aiming = false; // botón derecho mantenido
    this.aimBlend = 0;   // 0 = explorar, 1 = apuntando (suavizado)
    this.isMoving = false;

    // Munición por arma (cargador) + estado de recarga + dispersión.
    this.ammo = {};
    for (const k in WEAPONS) this.ammo[k] = WEAPONS[k].magSize;
    this.reloading = false;
    this.reloadEnd = 0;
    this.bloom = 0; // dispersión acumulada (0 = perfecta, 1 = spreadMax)

    // Verticalidad: altura sobre la plataforma de apoyo + gravedad.
    this.y = 0;
    this.vy = 0;
    this.position = { x: 0, y: 0, z: 0 };

    // Co-op: derribado (hp 0) hasta que un aliado lo reanime parándose encima
    // REVIVE_TIME segundos. En solitario no se usa (morir = game over directo).
    this.downed = false;
    this.reviveProgress = 0; // segundos acumulados de reanimación
  }

  /** Cae derribado (co-op): inmóvil, sin disparar, esperando reanimación. */
  enterDowned() {
    this.downed = true;
    this.hp = 0;
    this.reviveProgress = 0;
    this.aiming = false;
    this.reloading = false;
  }

  /** Reanimado por un aliado: se levanta con parte de la vida. */
  revive() {
    this.downed = false;
    this.reviveProgress = 0;
    this.hp = Math.max(1, Math.round(this.maxHp * REVIVE_HP_FRACT));
  }

  get reviveTime() { return REVIVE_TIME; }

  get speed() { return PLAYER_UPGRADES.speed.apply(BASE_SPEED, this.playerUpgrades.speed); }

  /** Estadísticas efectivas del arma = valores base + mejoras compradas. */
  effWeapon(key) {
    const w = WEAPONS[key];
    const u = this.weaponUpgrades[key];
    return {
      ...w,
      damage: WEAPON_UPGRADES.damage.apply(w.damage, u.damage),
      fireRate: WEAPON_UPGRADES.fireRate.apply(w.fireRate, u.fireRate),
      magSize: Math.round(WEAPON_UPGRADES.magSize.apply(w.magSize, u.magSize)),
      reloadTime: WEAPON_UPGRADES.reload.apply(w.reloadTime, u.reload),
    };
  }

  /** Movimiento (relativo a la cámara, ya resuelto en moveDir) + verticalidad. */
  move(delta, moveDir, aiming, jump) {
    this.aiming = aiming;
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, delta * 7);

    // La precisión se recupera al no disparar (dispersión vuelve al mínimo).
    const wNow = WEAPONS[this.weapon];
    this.bloom = Math.max(0, this.bloom - (wNow.bloomRecover || 4) * delta);

    this.isMoving = !!moveDir;
    let moveYaw = this.facing;
    const p = this.position;
    if (moveDir) {
      moveYaw = Math.atan2(moveDir.x, moveDir.z);
      const sp = this.speed * (aiming ? 0.38 : 1); // apuntando: caminar lento
      p.x += moveDir.x * sp * delta;
      p.z += moveDir.z * sp * delta;
      this.world.walls.resolveCircle(p, this.radius, this.y, 1.8);
      this.world.clampToWorld(p, this.radius);
    }

    // Verticalidad: caer/posarse sobre la plataforma de apoyo; salto si está apoyado.
    const support = this.world.supportHeight(p.x, p.z, this.y);
    const grounded = this.y <= support + 0.02 && this.vy <= 0.001;
    if (grounded) {
      this.y = support;
      this.vy = 0;
      if (jump) this.vy = JUMP_V;
    }
    if (this.vy !== 0 || this.y > support + 0.02) {
      this.vy -= GRAVITY * delta;
      this.y += this.vy * delta;
      if (this.y < support) { this.y = support; this.vy = 0; }
    }
    p.y = this.y;

    this.updateFacing(delta, moveYaw);
  }

  /** Cuerpo hacia el objetivo (apuntar) o el movimiento (explorar); giro gradual. */
  updateFacing(delta, moveYaw) {
    let target = this.facing;
    if (this.aiming) target = Math.atan2(this.aimDir.x, this.aimDir.z);
    else if (this.isMoving) target = moveYaw;
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = this.aiming ? 11 : 6.5; // apuntar gira algo más rápido
    this.facing += d * Math.min(1, delta * turn);
  }

  startReload(time) {
    const w = this.effWeapon(this.weapon);
    if (this.reloading || this.ammo[this.weapon] >= w.magSize) return;
    this.reloading = true;
    this.reloadEnd = time + w.reloadTime;
    this.world.fx.sound('reload');
  }

  updateReload(time) {
    if (this.reloading && time >= this.reloadEnd) {
      this.ammo[this.weapon] = this.effWeapon(this.weapon).magSize;
      this.reloading = false;
    }
  }

  switchWeapon(key) {
    if (this.owned.has(key) && key !== this.weapon) {
      this.weapon = key;
      this.reloading = false; // cambiar de arma cancela la recarga
    }
  }

  /**
   * Dispara el arma `w` (lógica pura). Calcula el cañón a partir del estado
   * (posición + `facing`, sin depender del mesh) y la dirección hacia `aimPoint`
   * (la intención que aporta el cliente). Lanza el proyectil/hitscan, aplica el
   * retroceso de cámara y sube el bloom. Devuelve el origen del disparo (para el
   * fogonazo del cliente). No decrementa munición: eso lo hace el llamador.
   */
  fire(w) {
    const p = this.position;
    const cf = Math.cos(this.facing);
    const sf = Math.sin(this.facing);
    // Cañón aproximado (equivale al arma en modo apuntar, offset local 0.34,1.1,0.62).
    let ox = p.x + 0.34 * cf + 0.62 * sf;
    let oy = p.y + 1.1;
    let oz = p.z - 0.34 * sf + 0.62 * cf;

    // Dirección 3D hacia el punto de mira; si degenera, la dir horizontal.
    let dx = this.aimPoint.x - ox;
    let dy = this.aimPoint.y - oy;
    let dz = this.aimPoint.z - oz;
    let dl = Math.hypot(dx, dy, dz);
    if (dl < 0.01) { dx = this.aimDir.x; dy = 0; dz = this.aimDir.z; dl = Math.hypot(dx, dy, dz) || 1; }
    dx /= dl; dy /= dl; dz /= dl;

    // Sale por la punta del cañón, no del cuerpo.
    ox += dx * 0.35; oy += dy * 0.35; oz += dz * 0.35;
    const origin = { x: ox, y: oy, z: oz };
    const dir = { x: dx, y: dy, z: dz };

    if (w.kind === 'grenade') {
      this.world.spawnBullet(origin, dir, w, w.damage);
    } else {
      // Hitscan unificado: dispersión resuelta por el bloom actual.
      const spread = w.spreadMin + (w.spreadMax - w.spreadMin) * this.bloom;
      this.world.hitscanFire(origin, dir, w, 1, spread);
      this.bloom = Math.min(1, this.bloom + (w.bloomPerShot || 0));
    }

    // Retroceso de cámara (vertical + leve horizontal aleatorio) — efecto de cliente.
    this.world.fx.recoil(w.recoilPitch || 0, (Math.random() - 0.5) * 2 * (w.recoilYaw || 0));
    return origin;
  }

  takeDamage(amount, time) {
    if (time < this.invulnUntil) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = time + 0.6;
    return true;
  }

  heal(amount) {
    this.hp = amount === Infinity ? this.maxHp : Math.min(this.maxHp, this.hp + amount);
  }

  /** Recalcula la vida máxima tras subir la mejora y regala la vida ganada. */
  applyMaxHpUpgrade() {
    const before = this.maxHp;
    this.maxHp = PLAYER_UPGRADES.maxHp.apply(PLAYER_MAX_HP, this.playerUpgrades.maxHp);
    this.hp += this.maxHp - before;
  }
}
