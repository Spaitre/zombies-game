// Partida co-op AUTORITARIA (Fase 2b). El servidor corre el HeadlessWorld; este
// mixin de Game hace de cliente: mueve al jugador local (client-trusted), envía
// inputs (~15/s) y aplica los snapshots: vida/munición/derribo propios, compañeros,
// zombies y proyectiles "títere" (interpolados) y eventos de efectos. Aquí NO se
// simulan oleadas/colisiones/daño: manda el servidor.
import * as THREE from 'three';
import Zombie from '../entities/Zombie.js';
import { BOSS_MODES, WORLD, BOSS_MODE_WORLD_MULT } from './shared.js';

const INPUT_INTERVAL = 1 / 15;

const BULLET_GEO = new THREE.SphereGeometry(0.16, 8, 8);
const GRENADE_GEO = new THREE.SphereGeometry(0.26, 10, 10);
const BULLET_COLORS = { g: 0x9ccc65, b: 0xfff176, e: 0xab47bc };

export default {
  /** Arranca la partida co-op (la dispara net.onStart para TODOS los de la sala). */
  startCoopGame(diff) {
    const cfg = BOSS_MODES[diff];
    if (!cfg) return;
    this.mode = 'boss';
    this.coopActive = true;
    this.bossCfg = cfg;
    this.wave = cfg.level; // para el HUD y la pantalla de game over
    this.setWorldSize(WORLD * BOSS_MODE_WORLD_MULT);
    this.prepare(); // jugador local con el mismo loadout que aplicó el servidor

    this.hud.hideMenu();
    this.hud.hideBossMenu();
    this.hud.hideGameOver();
    this.hud.hideShop();
    this.hud.hideLobby();
    this.setupNetPlayers();

    this.zPuppets = new Map(); // id de red -> vista Zombie (títere)
    this.bPuppets = new Map(); // id de red -> { mesh, tx, ty, tz }
    this._snap = null;
    this._inputTimer = 0;
    this._coopOver = false;

    this.state = 'playing';
    this.lockPointer();
    this.hud.update(this.stats());
    this.hud.announce(`CO-OP · ${cfg.label}`, 2500);
    this.fx.sound('waveStart');
  },

  /** Tick de cliente co-op (reemplaza a step() mientras coopActive). */
  coopStep(delta) {
    const p = this.player;
    p.aim();
    p.handleWeaponSwitch();
    p.move(delta); // con guardia interna si está derribado

    this._coopSendInput(delta);
    this._coopApplySnap(delta);
  },

  _coopSendInput(delta) {
    if (!this.net || !this.net.inRoom) return;
    this._inputTimer -= delta;
    if (this._inputTimer > 0) return;
    this._inputTimer = INPUT_INTERVAL;
    const p = this.player;
    this.net.sendInput({
      px: +p.position.x.toFixed(2), py: +p.position.y.toFixed(2), pz: +p.position.z.toFixed(2),
      f: +p.sim.facing.toFixed(3),
      aiming: p.sim.aiming ? 1 : 0,
      fire: (this.input.firing && p.sim.aiming) ? 1 : 0,
      reload: this.input.keys.has('KeyR') ? 1 : 0,
      weapon: p.weapon,
      ax: +p.aimPoint.x.toFixed(2), ay: +p.aimPoint.y.toFixed(2), az: +p.aimPoint.z.toFixed(2),
    });
  },

  _coopApplySnap(delta) {
    const s = this._snap;
    if (s) {
      this._snap = null;

      // Estado propio autoritario: vida, munición, recarga, derribo.
      const me = s.pl.find((q) => q.id === this.net.id);
      if (me) {
        const sim = this.player.sim;
        sim.hp = me.hp;
        sim.maxHp = me.mhp;
        if (me.wp === sim.weapon) sim.ammo[sim.weapon] = me.am;
        sim.reloading = !!me.rl;
        if (me.dw && !sim.downed) { sim.enterDowned(); this.hud.announce('¡HAS CAÍDO! Un aliado debe pararse encima para reanimarte', 4000); }
        if (!me.dw && sim.downed) { sim.downed = false; sim.hp = me.hp; }
        if (me.dw) this._coopReviveUI(me.rp);
      }

      // Compañeros (posición + derribo visual).
      for (const q of s.pl) {
        if (q.id === this.net.id) continue;
        const rp = this.remotePlayers.get(q.id);
        if (rp) { rp.setState(q); rp.setDowned(!!q.dw); }
      }

      // Zombies títere: crear los nuevos, actualizar objetivos, matar los ausentes.
      const seen = new Set();
      for (const zs of s.zs) {
        seen.add(zs.i);
        let z = this.zPuppets.get(zs.i);
        if (!z) {
          z = new Zombie(this, zs.ty, zs.x, zs.z, this.bossCfg.level);
          z.puppet = true;
          this.zPuppets.set(zs.i, z);
          this.zombies.push(z); // también para el raycast de la mira
        }
        z.setNetTarget(zs);
      }
      for (const [id, z] of this.zPuppets) {
        if (seen.has(id)) continue;
        this.zPuppets.delete(id);
        this.zombies = this.zombies.filter((q) => q !== z);
        if (z.alive) { z.die(); this.corpses.push(z); } // muerte local (anim + fade)
      }

      // Proyectiles títere (granadas, escupitajos).
      const bseen = new Set();
      for (const bs of s.bl) {
        bseen.add(bs.i);
        let bp = this.bPuppets.get(bs.i);
        if (!bp) {
          const mesh = new THREE.Mesh(
            bs.k === 'g' ? GRENADE_GEO : BULLET_GEO,
            new THREE.MeshStandardMaterial({ color: BULLET_COLORS[bs.k], emissive: BULLET_COLORS[bs.k], emissiveIntensity: 0.8 }),
          );
          mesh.position.set(bs.x, bs.y, bs.z);
          this.scene.add(mesh);
          bp = { mesh, tx: bs.x, ty: bs.y, tz: bs.z };
          this.bPuppets.set(bs.i, bp);
        }
        bp.tx = bs.x; bp.ty = bs.y; bp.tz = bs.z;
      }
      for (const [id, bp] of this.bPuppets) {
        if (bseen.has(id)) continue;
        this.scene.remove(bp.mesh);
        bp.mesh.material.dispose();
        this.bPuppets.delete(id);
      }

      for (const e of (s.ev || [])) this._coopEvent(e);
      this.score = s.sc;
      this.hud.update(this.stats());
    }

    // Interpolación continua entre snapshots.
    for (const z of this.zPuppets.values()) z.updatePuppet(delta);
    for (const bp of this.bPuppets.values()) {
      const m = bp.mesh.position;
      const k = Math.min(1, delta * 12);
      m.x += (bp.tx - m.x) * k; m.y += (bp.ty - m.y) * k; m.z += (bp.tz - m.z) * k;
    }

    // Barra de jefe: el primero vivo.
    let boss = null;
    for (const z of this.zPuppets.values()) if (z.sim.type === 'boss' && z.alive) { boss = z; break; }
    if (boss) {
      this.boss = boss;
      this.hud.showBossBar();
      this.hud.updateBossBar(boss.sim.hp / boss.sim.maxHp);
    } else if (this.boss) {
      this.boss = null;
      this.hud.hideBossBar();
    }
  },

  /** Progreso de reanimación mientras estás derribado (texto persistente). */
  _coopReviveUI(progress) {
    const pct = Math.min(100, Math.round((progress / 10) * 100));
    this.hud.announce(progress > 0.2 ? `REANIMANDO… ${pct}%` : 'DERRIBADO — espera a un aliado', 900);
  },

  /** Reproduce un evento del servidor con los FX locales. */
  _coopEvent(e) {
    switch (e.e) {
      case 'blood': this.fx.blood(e); break;
      case 'tracer': this.fx.tracer({ x: e.x0, y: e.y0, z: e.z0 }, { x: e.x1, y: e.y1, z: e.z1 }, e.color); break;
      case 'explosion': this.fx.explosion(e, e.radius); break;
      case 'muzzle': this.fx.muzzleFlash(e); break;
      case 'sound': this.fx.sound(e.name); break;
      case 'kill': this.fx.sound('zombieDeath'); break;
      case 'boss': this.hud.announce('¡JEFE!', 2000); this.fx.sound('bossSpawn'); break;
      case 'downed':
        if (e.id !== this.net.id) this.hud.announce('¡Un compañero ha caído! Párate encima para reanimarlo', 3500);
        break;
      case 'revived':
        this.hud.announce(e.id === this.net.id ? '¡REANIMADO!' : 'Compañero reanimado', 2000);
        break;
      case 'victory': this._coopEnd(true); break;
      case 'gameover': this._coopEnd(false); break;
      default: break;
    }
  },

  _coopEnd(win) {
    if (this._coopOver) return;
    this._coopOver = true;
    this.state = 'over';
    this.unlockPointer();
    this.hud.hideBossBar();
    if (win) {
      this.hud.announce('¡NIVEL COMPLETADO!', 3500);
      this.fx.sound('waveStart');
      setTimeout(() => this.showMainMenu(), 3200);
    } else {
      this.fx.sound('gameOver');
      this.hud.showGameOver(this.score, this.wave, () => this.showMainMenu());
    }
  },

  /** Limpieza del co-op (al volver al menú). */
  coopCleanup() {
    this.coopActive = false;
    this._coopOver = false;
    this._snap = null;
    if (this.zPuppets) {
      for (const z of this.zPuppets.values()) z.destroy();
      this.zPuppets.clear();
    }
    if (this.bPuppets) {
      for (const bp of this.bPuppets.values()) { this.scene.remove(bp.mesh); bp.mesh.material.dispose(); }
      this.bPuppets.clear();
    }
  },
};
