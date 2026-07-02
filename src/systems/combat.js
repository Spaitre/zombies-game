// Combate: proyectiles, hitscan (escopeta/rifle), raycasts, trazas, explosiones
// y resolución de colisiones. Mixin de Game (`this` = instancia de Game).
import * as THREE from 'three';
import Bullet from '../entities/Bullet.js';
import EnemyBullet from '../entities/EnemyBullet.js';
import { VERT_HIT, dist2 } from './shared.js';

// Vectores/estado reutilizables del motor hitscan (evita asignaciones por frame).
const _hsRight = new THREE.Vector3();
const _hsUp = new THREE.Vector3();
const _hsDir = new THREE.Vector3();
const _pierceEnd = new THREE.Vector3();
const _seenZombies = new Set();

/** Desvía `base` dentro de un cono uniforme de semiángulo `spread` (patrón
 *  circular). Escribe el resultado normalizado en `out`. */
function deviate(base, spread, out) {
  if (spread <= 0.0001) { out.copy(base); return; }
  _hsUp.set(0, 1, 0);
  if (Math.abs(base.y) > 0.99) _hsUp.set(1, 0, 0);
  _hsRight.crossVectors(base, _hsUp).normalize();
  _hsUp.crossVectors(_hsRight, base).normalize();
  const r = Math.tan(spread) * Math.sqrt(Math.random());
  const phi = Math.random() * Math.PI * 2;
  out.copy(base)
    .addScaledVector(_hsRight, r * Math.cos(phi))
    .addScaledVector(_hsUp, r * Math.sin(phi))
    .normalize();
}

export default {
  spawnBullet(origin, dir, weapon, damage) {
    this.bullets.push(new Bullet(this, origin, dir, weapon, damage));
  },

  /**
   * Motor de disparo hitscan unificado (pistola, rifle y escopeta). Lanza
   * `w.pellets` raycasts desde el cañón (origin), cada uno desviado dentro del
   * cono `spread` (dispersión ya resuelta por el bloom en Player). Cada bala
   * atraviesa hasta `w.penetration` enemigos extra. El daño acumulado sobre un
   * mismo enemigo se aplica una sola vez (evita disparar `killZombie` de más).
   */
  hitscanFire(origin, baseDir, w, damageMult = 1, spread = 0) {
    const pellets = w.pellets || 1;
    const pierce = w.penetration || 0;
    const perHit = (w.damage || 0) * damageMult;

    const dmgByZombie = new Map(); // enemigo → daño total recibido en este disparo
    for (let i = 0; i < pellets; i += 1) {
      deviate(baseDir, spread, _hsDir);
      const res = this.raycastPierce(origin, _hsDir, w.range, pierce);
      for (const hit of res.zombies) {
        dmgByZombie.set(hit.zombie, (dmgByZombie.get(hit.zombie) || 0) + perHit);
        this.fx.blood(hit.point);
      }
      this.fx.tracer(origin, res.end, w.color);
    }

    for (const [z, dmg] of dmgByZombie) {
      if (z.alive && z.hurt(dmg)) this.killZombie(z);
    }
  },

  /**
   * Raycast que atraviesa hasta `pierce` enemigos extra. Devuelve
   * `{ zombies: [{ zombie, point }], end }`: los enemigos alcanzados en orden y
   * el punto donde termina la traza (impacto en pared/suelo, último enemigo
   * penetrado, o el alcance máximo si no golpea nada). Nota: `end` reutiliza un
   * vector compartido; consúmelo antes del siguiente raycast.
   */
  raycastPierce(origin, dir, range, pierce = 0) {
    this.pelletRay.set(origin, dir);
    this.pelletRay.far = range;
    const objs = this._pelletObjs;
    objs.length = 0;
    for (const z of this.zombies) if (z.alive && !z.emerging) objs.push(z.mesh);
    for (const m of this.walls.meshes) objs.push(m);
    if (this.groundMesh) objs.push(this.groundMesh);
    const hits = this.pelletRay.intersectObjects(objs, true);

    const zombies = [];
    _seenZombies.clear();
    _pierceEnd.copy(origin).addScaledVector(dir, range); // por defecto: alcance máximo
    for (const h of hits) {
      let o = h.object;
      let z = null;
      while (o) { if (o.userData && o.userData.zombie) { z = o.userData.zombie; break; } o = o.parent; }
      if (z) {
        if (_seenZombies.has(z)) continue; // un zombie puede dar varios sub-impactos
        _seenZombies.add(z);
        zombies.push({ zombie: z, point: h.point.clone() });
        if (zombies.length > pierce) { _pierceEnd.copy(h.point); break; } // tope de enemigos
      } else {
        _pierceEnd.copy(h.point); // pared/suelo detiene la bala
        break;
      }
    }
    return { zombies, end: _pierceEnd };
  },

  /** Traza visual breve del perdigón (línea que se desvanece). */
  spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({ mesh: line, life: 0.07, maxLife: 0.07, vel: null, disposeOnEnd: true });
  },

  spawnEnemyBullet(origin, dx, dz, damage, originY = 1.0) {
    // origin puede ser un vector plano {x,y,z} (estado de simulación); no usar .clone().
    const o = { x: origin.x, y: originY, z: origin.z }; // a la altura del jugador (también en el loft)
    this.enemyBullets.push(new EnemyBullet(this, o, { x: dx, y: 0, z: dz }, 12, damage));
  },

  explode(pos, radius, damage) {
    this.fx.explosion(pos, radius);
    this.fx.sound('explosion');
    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (dist2(pos.x, pos.z, z.position.x, z.position.z) <= radius * radius) {
        if (z.hurt(damage)) this.killZombie(z);
      }
    }
  },

  handleCollisions(time) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      for (const z of this.zombies) {
        if (!z.alive) continue;
        if (Math.abs(b.position.y - z.position.y) > VERT_HIT) continue;
        const rr = b.radius + z.radius;
        if (dist2(b.position.x, b.position.z, z.position.x, z.position.z) <= rr * rr) {
          if (b.kind === 'grenade') {
            b.onHit();
          } else {
            b.alive = false;
            if (z.hurt(b.damage)) this.killZombie(z);
          }
          break;
        }
      }
    }

    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (Math.abs(z.position.y - this.player.position.y) > VERT_HIT) continue;
      const rr = z.radius + this.player.radius;
      if (dist2(z.position.x, z.position.z, this.player.position.x, this.player.position.z) <= rr * rr) {
        if (this.player.takeDamage(z.damage, time)) {
          this.onPlayerHurt(0.35);
          if (this.player.hp <= 0) { this.gameOver(); return; }
        }
      }
    }

    // Proyectiles enemigos contra el jugador.
    for (const eb of this.enemyBullets) {
      if (!eb.alive) continue;
      if (Math.abs(eb.position.y - this.player.position.y) > VERT_HIT) continue;
      const rr = eb.radius + this.player.radius;
      if (dist2(eb.position.x, eb.position.z, this.player.position.x, this.player.position.z) <= rr * rr) {
        eb.alive = false;
        if (this.player.takeDamage(eb.damage, time)) {
          this.onPlayerHurt(0.3);
          if (this.player.hp <= 0) { this.gameOver(); return; }
        }
      }
    }

    for (const it of this.items) {
      if (!it.alive) continue;
      if (Math.abs(it.position.y - this.player.position.y) > VERT_HIT) continue;
      if (dist2(it.position.x, it.position.z, this.player.position.x, this.player.position.z) <= it.radius * it.radius) {
        const text = it.apply(this.player);
        if (text) this.hud.announce(text); // monedas no anuncian (devuelven '')
        if (it.type === 'weapon') this.saveProgress(); // desbloqueó un arma → persiste
        this.fx.sound('pickup');
        it.destroy();
        this.hud.update(this.stats());
      }
    }

    this.bullets = this.bullets.filter((b) => { if (!b.alive) { b.destroy(); return false; } return true; });
    this.enemyBullets = this.enemyBullets.filter((eb) => { if (!eb.alive) { eb.destroy(); return false; } return true; });
    this.zombies = this.zombies.filter((z) => z.alive);
    this.items = this.items.filter((it) => it.alive);
  },
};
