/**
 * Mundo HEADLESS: la simulación completa del juego sin Three.js ni DOM, apta
 * para correr en Node (servidor autoritario del co-op, Fase 2) — y también en
 * el cliente para tests. Reúne:
 *   - Mapa de colisión idéntico al del cliente (mapLayout) + Walls + NavGrid.
 *   - Jugadores (PlayerSim) movidos por INPUTS, con derribo/reanimación co-op.
 *   - Zombies (ZombieSim) con flow-field multi-fuente (persiguen al más cercano).
 *   - Proyectiles (BulletSim/EnemyBulletSim) y hitscan matemático (sin Raycaster).
 *   - Línea temporal del modo jefe (hordas + jefes por tiempo).
 * Los efectos se acumulan como EVENTOS en `this.events` (para difundirlos por
 * red en la Fase 2b); aquí no se dibuja ni suena nada.
 */
import Walls from '../Walls.js';
import NavGrid from '../NavGrid.js';
import { buildLayout } from './mapLayout.js';
import ZombieSim, { ZOMBIE_TYPES } from './ZombieSim.js';
import PlayerSim from './PlayerSim.js';
import BulletSim from './BulletSim.js';
import EnemyBulletSim from './EnemyBulletSim.js';
import platformsMixin from '../systems/platforms.js';
import {
  WORLD, VERT_HIT, rand, dist2,
  BOSS_MODES, BOSS_MODE_TOTAL, BOSS_MODE_MAX_ALIVE, BOSS_MODE_INTERVAL,
  BOSS_MODE_HP_MULT, BOSS_MODE_WORLD_MULT, BOSS_MODE_MIX,
  REVIVE_RADIUS, HIP_SPREAD,
} from '../systems/shared.js';

export default class HeadlessWorld {
  constructor({ arenaSize = WORLD, hitPad = 0 } = {}) {
    this.worldSize = arenaSize;
    this.hitPad = hitPad; // hitbox extra de zombies (co-op: compensa latencia)

    // Mundo de colisión idéntico al cliente (verificado caja a caja).
    const layout = buildLayout();
    this.walls = new Walls();
    for (const b of layout.boxes) this.walls.addBox(b.cx, b.cz, b.hx, b.hz, b.y0, b.y1);
    this.platforms = layout.platforms;
    this.nav = new NavGrid(WORLD, this.walls, this.platforms, 1, 0.55);

    this.players = new Map();  // id -> PlayerSim
    this.inputs = new Map();   // id -> último input (ver step())
    this._eid = 1;             // ids de entidades para los snapshots de red
    this.zombies = [];
    this.corpses = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.score = 0;
    this.gameOver = false;
    this.victory = false;

    // Efectos → cola de eventos (la Fase 2b los difunde a los clientes).
    this.events = [];
    const ev = (e, data) => this.events.push({ e, ...data });
    this.fx = {
      blood: (pos) => ev('blood', { x: pos.x, y: pos.y, z: pos.z }),
      tracer: (from, to, color) => ev('tracer', { x0: from.x, y0: from.y, z0: from.z, x1: to.x, y1: to.y, z1: to.z, color }),
      explosion: (pos, radius) => ev('explosion', { x: pos.x, y: pos.y, z: pos.z, radius }),
      muzzleFlash: (pos) => ev('muzzle', { x: pos.x, y: pos.y, z: pos.z }),
      recoil: () => {},          // efecto de cámara: solo cliente
      sound: (name) => ev('sound', { name }),
    };

    this.bossCfg = null; // línea temporal del modo jefe (startBossLevel)
  }

  // --- Jugadores e inputs ----------------------------------------------------

  addPlayer(id) {
    const p = new PlayerSim(this);
    const i = this.players.size;
    p.position.x = (i % 2) * 2 - 1;   // spawns repartidos alrededor del origen
    p.position.z = Math.floor(i / 2) * 2 - 1;
    this.players.set(id, p);
    return p;
  }

  setInput(id, input) {
    this.inputs.set(id, input);
  }

  /** Id de sala de un PlayerSim (para eventos con destinatario). */
  playerId(p) {
    for (const [id, q] of this.players) if (q === p) return id;
    return null;
  }

  /** Aplica el loadout persistido del cliente (armas + mejoras) a su PlayerSim. */
  applyLoadout(id, lo) {
    const p = this.players.get(id);
    if (!p || !lo) return;
    if (Array.isArray(lo.owned)) p.owned = new Set(lo.owned);
    if (lo.weaponUpgrades) {
      for (const k in p.weaponUpgrades) if (lo.weaponUpgrades[k]) Object.assign(p.weaponUpgrades[k], lo.weaponUpgrades[k]);
    }
    if (lo.playerUpgrades) Object.assign(p.playerUpgrades, lo.playerUpgrades);
    p.applyMaxHpUpgrade();
    p.hp = p.maxHp;
    for (const k in p.ammo) p.ammo[k] = p.effWeapon(k).magSize;
  }

  /** Jugadores objetivo para zombies/flow (vivos y no derribados). */
  aliveTargets() {
    const out = [];
    for (const p of this.players.values()) if (!p.downed) out.push(p);
    return out;
  }

  nearestTarget(pos, targets) {
    let best = null;
    let bd = Infinity;
    for (const t of targets) {
      const d = dist2(pos.x, pos.z, t.position.x, t.position.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // --- Consultas de mundo (misma API que Game) --------------------------------

  clampToWorld(pos, r) {
    const m = this.worldSize - r - 0.5;
    pos.x = Math.max(-m, Math.min(m, pos.x));
    pos.z = Math.max(-m, Math.min(m, pos.z));
  }

  isInWorld(pos) {
    return Math.abs(pos.x) <= this.worldSize && Math.abs(pos.z) <= this.worldSize;
  }

  // --- Combate (hitscan matemático, sin Raycaster) -----------------------------

  spawnBullet(origin, dir, weapon, damage) {
    const b = new BulletSim(this, origin, dir, weapon, damage);
    b.id = this._eid++;
    this.bullets.push(b);
  }

  spawnEnemyBullet(origin, dx, dz, damage, originY = 1.0) {
    const o = { x: origin.x, y: originY, z: origin.z };
    const b = new EnemyBulletSim(this, o, { x: dx, y: 0, z: dz }, 12, damage);
    b.id = this._eid++;
    this.enemyBullets.push(b);
  }

  /** Rayo vs caja AABB [cx±hx]×[y0,y1]×[cz±hz] (método de slabs). Devuelve t o null. */
  static rayBox(o, d, b, range) {
    let tmin = 0;
    let tmax = range;
    const axes = [
      [o.x, d.x, b.cx - b.hx, b.cx + b.hx],
      [o.y, d.y, b.y0, b.y1 === Infinity ? 1e9 : b.y1],
      [o.z, d.z, b.cz - b.hz, b.cz + b.hz],
    ];
    for (const [oa, da, lo, hi] of axes) {
      if (Math.abs(da) < 1e-9) {
        if (oa < lo || oa > hi) return null;
      } else {
        let t1 = (lo - oa) / da;
        let t2 = (hi - oa) / da;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin > 0 ? tmin : null;
  }

  /** Rayo vs zombie como cilindro vertical (radio + pad, altura del tipo). t o null. */
  static rayZombie(o, d, z, range, pad = 0) {
    const h = ZOMBIE_TYPES[z.type].targetH;
    const ox = o.x - z.position.x;
    const oz = o.z - z.position.z;
    const a = d.x * d.x + d.z * d.z;
    const r = z.radius + pad;
    let t;
    if (a < 1e-9) { // rayo vertical: dentro del círculo o no
      if (ox * ox + oz * oz > r * r) return null;
      t = 0.001;
    } else {
      const b = 2 * (ox * d.x + oz * d.z);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > range) return null;
    }
    const y = o.y + d.y * t;
    if (y < z.position.y || y > z.position.y + h) return null;
    return t;
  }

  /** Equivalente headless de Game.raycastPierce: zombies + paredes + suelo. */
  raycastPierce(origin, dir, range, pierce = 0) {
    const hits = []; // { t, zombie|null }
    for (const z of this.zombies) {
      if (!z.alive || z.emerging) continue;
      const t = HeadlessWorld.rayZombie(origin, dir, z, range, this.hitPad);
      if (t !== null) hits.push({ t, zombie: z });
    }
    // Pared más cercana (una basta: detiene la bala).
    let wallT = Infinity;
    for (const b of this.walls.boxes) {
      const t = HeadlessWorld.rayBox(origin, dir, b, range);
      if (t !== null && t < wallT) wallT = t;
    }
    // Suelo (y = 0).
    if (dir.y < -1e-9) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < wallT && t <= range) wallT = t;
    }
    hits.sort((a, b) => a.t - b.t);

    const zombies = [];
    let endT = Math.min(range, wallT);
    for (const h of hits) {
      if (h.t >= wallT) break; // la pared detiene la bala
      zombies.push({ zombie: h.zombie, point: pointAt(origin, dir, h.t) });
      if (zombies.length > pierce) { endT = h.t; break; }
    }
    return { zombies, end: pointAt(origin, dir, endT) };
  }

  /** Motor hitscan unificado (mismo contrato que combat.hitscanFire). */
  hitscanFire(origin, baseDir, w, damageMult = 1, spread = 0) {
    const pellets = w.pellets || 1;
    const pierce = w.penetration || 0;
    const perHit = (w.damage || 0) * damageMult;
    const dmgByZombie = new Map();
    for (let i = 0; i < pellets; i += 1) {
      const dir = deviate(baseDir, spread);
      const res = this.raycastPierce(origin, dir, w.range, pierce);
      for (const hit of res.zombies) {
        dmgByZombie.set(hit.zombie, (dmgByZombie.get(hit.zombie) || 0) + perHit);
        this.fx.blood(hit.point);
      }
      this.fx.tracer(origin, res.end, w.color);
    }
    for (const [z, dmg] of dmgByZombie) {
      if (z.alive && z.hurt(dmg)) this.killZombie(z);
    }
  }

  explode(pos, radius, damage) {
    this.fx.explosion(pos, radius);
    this.fx.sound('explosion');
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (dist2(pos.x, pos.z, z.position.x, z.position.z) <= radius * radius) {
        if (z.hurt(damage)) this.killZombie(z);
      }
    }
  }

  killZombie(z) {
    if (z.dying) return;
    this.fx.blood(z.position);
    this.score += z.score;
    this.events.push({ e: 'kill', type: z.type, x: z.position.x, y: z.position.y, z: z.position.z });
    z.die();
    this.corpses.push(z);
  }

  /** Disparo con cadencia/cargador/auto-recarga (equivalente a Player.tryFire).
   *  Sin apuntar: dispersión extra de cadera. */
  tryFire(p, time) {
    const w = p.effWeapon(p.weapon);
    if (p.reloading || p.downed) return;
    if (time <= p.lastFired + w.fireRate) return;
    if (p.ammo[p.weapon] <= 0) { p.startReload(time); return; }
    const origin = p.fire(w, p.aiming ? 0 : HIP_SPREAD);
    p.ammo[p.weapon] -= 1;
    p.lastFired = time;
    this.fx.muzzleFlash(origin);
    this.fx.sound('shoot');
  }

  // --- Tick de simulación ------------------------------------------------------

  step(delta, time) {
    if (this.gameOver || this.victory) return;

    // 1) Jugadores según su input (los derribados no se mueven ni disparan).
    // Dos vías: `moveDir` (la sim mueve, usada en tests) o `pos` (posición
    // reportada por el cliente — movimiento client-trusted del co-op; el
    // servidor manda en enemigos, daño, munición y reanimación).
    for (const [id, p] of this.players) {
      const inp = this.inputs.get(id) || {};
      if (p.downed) continue;
      if (inp.aimPoint) {
        p.aimPoint.x = inp.aimPoint.x; p.aimPoint.y = inp.aimPoint.y; p.aimPoint.z = inp.aimPoint.z;
        const dx = inp.aimPoint.x - p.position.x;
        const dz = inp.aimPoint.z - p.position.z;
        const l = Math.hypot(dx, dz) || 1;
        p.aimDir.x = dx / l; p.aimDir.z = dz / l;
      }
      if (inp.weapon && p.owned.has(inp.weapon)) p.weapon = inp.weapon;
      p.updateReload(time);
      if (inp.pos) {
        p.position.x = inp.pos.x; p.position.z = inp.pos.z;
        p.y = inp.pos.y; p.position.y = inp.pos.y;
        if (inp.facing !== undefined) p.facing = inp.facing;
        p.aiming = !!inp.aiming;
      } else {
        p.move(delta, inp.moveDir || null, !!inp.aiming, !!inp.jump);
      }
      if (inp.reload) p.startReload(time);
      if (inp.fire) this.tryFire(p, time); // apuntar ya no es requisito (cadera)
    }

    // 2) Objetivos vivos; si no queda ninguno → game over.
    const targets = this.aliveTargets();
    if (targets.length === 0) {
      this.gameOver = true;
      this.events.push({ e: 'gameover' });
      return;
    }

    // 3) Zombies: flow-field multi-fuente → cada uno persigue al más cercano.
    this.nav.computeFlowFieldMulti(targets.map((t) => ({ x: t.position.x, z: t.position.z, level: t.position.y > 1.3 ? 1 : 0 })));
    if (this.bossCfg) this.updateBossLevel(delta);
    for (const z of this.zombies) z.update(delta, this.nearestTarget(z.position, targets), this.zombies);
    for (const b of this.bullets) b.update(delta);
    for (const eb of this.enemyBullets) eb.update(delta);

    // 4) Colisiones (equivalente headless de combat.handleCollisions).
    this.handleCollisions(time, targets);

    // 5) Reanimación: un aliado parado encima acumula tiempo; al completar, revive.
    for (const p of this.players.values()) {
      if (!p.downed) continue;
      let allyNear = false;
      for (const a of this.players.values()) {
        if (a === p || a.downed) continue;
        if (dist2(a.position.x, a.position.z, p.position.x, p.position.z) <= REVIVE_RADIUS * REVIVE_RADIUS
          && Math.abs(a.position.y - p.position.y) < 2) { allyNear = true; break; }
      }
      if (allyNear) {
        p.reviveProgress += delta;
        if (p.reviveProgress >= p.reviveTime) {
          p.revive();
          this.events.push({ e: 'revived', id: this.playerId(p) });
        }
      }
    }

    // 6) Cadáveres.
    for (const c of this.corpses) c.updateCorpse(delta);
    this.corpses = this.corpses.filter((c) => c.deathTimer > 0);
  }

  handleCollisions(time, targets) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        if (Math.abs(b.position.y - z.position.y) > VERT_HIT) continue;
        const rr = b.radius + z.radius;
        if (dist2(b.position.x, b.position.z, z.position.x, z.position.z) <= rr * rr) {
          if (b.kind === 'grenade') b.onHit();
          else { b.alive = false; if (z.hurt(b.damage)) this.killZombie(z); }
          break;
        }
      }
    }

    for (const z of this.zombies) {
      if (!z.alive) continue;
      for (const p of targets) {
        if (p.downed) continue;
        if (Math.abs(z.position.y - p.position.y) > VERT_HIT) continue;
        const rr = z.radius + p.radius;
        if (dist2(z.position.x, z.position.z, p.position.x, p.position.z) <= rr * rr) {
          if (p.takeDamage(z.damage, time) && p.hp <= 0) this.downPlayer(p);
        }
      }
    }

    for (const eb of this.enemyBullets) {
      if (!eb.alive) continue;
      for (const p of targets) {
        if (p.downed) continue;
        if (Math.abs(eb.position.y - p.position.y) > VERT_HIT) continue;
        const rr = eb.radius + p.radius;
        if (dist2(eb.position.x, eb.position.z, p.position.x, p.position.z) <= rr * rr) {
          eb.alive = false;
          if (p.takeDamage(eb.damage, time) && p.hp <= 0) this.downPlayer(p);
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((eb) => eb.alive);
    this.zombies = this.zombies.filter((z) => z.alive);
  }

  /** Derriba a un jugador (co-op): queda tirado esperando reanimación. */
  downPlayer(p) {
    p.enterDowned();
    this.events.push({ e: 'downed', id: this.playerId(p) });
  }

  // --- Modo jefe (misma línea temporal que systems/bossmode.js) ----------------

  startBossLevel(diffKey) {
    const cfg = BOSS_MODES[diffKey];
    if (!cfg) return;
    this.bossCfg = cfg;
    this.worldSize = WORLD * BOSS_MODE_WORLD_MULT;
    this.bossToSpawn = BOSS_MODE_TOTAL;
    this.bossSpawnTimer = BOSS_MODE_INTERVAL;
    this.bossElapsed = 0;
    this.bossQueue = cfg.bossTimes.slice();
  }

  updateBossLevel(delta) {
    this.bossElapsed += delta;

    if (this.bossToSpawn > 0) {
      this.bossSpawnTimer -= delta;
      if (this.bossSpawnTimer <= 0) {
        const aliveNormal = this.zombies.reduce((n, z) => n + (z.isBoss ? 0 : 1), 0);
        if (aliveNormal < BOSS_MODE_MAX_ALIVE) {
          const r = Math.random();
          let type = 'tank';
          for (const [t, thr] of BOSS_MODE_MIX) { if (r <= thr) { type = t; break; } }
          const s = this.bossSpawnEdge();
          const z = new ZombieSim(this, type, s.x, s.z, this.bossCfg.level);
          z.id = this._eid++;
          this.zombies.push(z);
          this.bossToSpawn -= 1;
        }
        this.bossSpawnTimer = BOSS_MODE_INTERVAL;
      }
    }

    while (this.bossQueue.length && this.bossElapsed >= this.bossQueue[0]) {
      this.bossQueue.shift();
      const s = this.bossSpawnEdge();
      const boss = new ZombieSim(this, 'boss', s.x, s.z, this.bossCfg.level, BOSS_MODE_HP_MULT);
      boss.id = this._eid++;
      this.zombies.push(boss);
      this.events.push({ e: 'boss' });
    }

    if (this.bossToSpawn === 0 && this.bossQueue.length === 0 && this.zombies.length === 0) {
      this.victory = true;
      this.events.push({ e: 'victory' });
    }
  }

  /** Borde del arena lejos de todos los jugadores. */
  bossSpawnEdge() {
    const m = this.worldSize - 2;
    let x = 0;
    let z = 0;
    for (let i = 0; i < 20; i += 1) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = -m; z = rand(-m, m); }
      else if (side === 1) { x = m; z = rand(-m, m); }
      else if (side === 2) { x = rand(-m, m); z = -m; }
      else { x = rand(-m, m); z = m; }
      let minD = Infinity;
      for (const p of this.players.values()) minD = Math.min(minD, dist2(x, z, p.position.x, p.position.z));
      if (minD > 400) break;
    }
    return { x, z };
  }
}

// Verticalidad compartida con el cliente (mismos métodos del mixin).
HeadlessWorld.prototype.platformTop = platformsMixin.platformTop;
HeadlessWorld.prototype.supportHeight = platformsMixin.supportHeight;

// --- Helpers ------------------------------------------------------------------

function pointAt(o, d, t) {
  return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
}

/** Desvía `base` dentro de un cono uniforme (mismo patrón que combat.deviate). */
function deviate(base, spread) {
  if (spread <= 0.0001) return { x: base.x, y: base.y, z: base.z };
  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (Math.abs(base.y) > 0.99) { ux = 1; uy = 0; }
  // right = base × up; up = right × base (ortonormales).
  let rx = base.y * uz - base.z * uy;
  let ry = base.z * ux - base.x * uz;
  let rz = base.x * uy - base.y * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const vx = ry * base.z - rz * base.y;
  const vy = rz * base.x - rx * base.z;
  const vz = rx * base.y - ry * base.x;
  const r = Math.tan(spread) * Math.sqrt(Math.random());
  const phi = Math.random() * Math.PI * 2;
  const cr = r * Math.cos(phi);
  const sr = r * Math.sin(phi);
  const dx = base.x + rx * cr + vx * sr;
  const dy = base.y + ry * cr + vy * sr;
  const dz = base.z + rz * cr + vz * sr;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
}
