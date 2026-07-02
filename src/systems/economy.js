// Economía: muerte de enemigos, drops de monedas físicas, salud y cadáveres.
// Mixin de Game (`this` = instancia de Game).
import Item from '../entities/Item.js';
import { COIN_DENOMS, BOSS_COIN_VALUE, rand } from './shared.js';

export default {
  killZombie(z) {
    if (z.dying) return;
    this.fx.blood(z.position);
    this.score += z.score;
    this.dropCoins(z); // monedas físicas (en vez de premio directo)
    if (z.isBoss) {
      this.boss = null;
      this.hud.hideBossBar();
      this.fx.explosion({ x: z.position.x, y: 1, z: z.position.z }, 5);
      this.fx.sound('explosion');
    } else {
      this.fx.sound('zombieDeath');
      this.maybeDropHealth(z);
    }
    // Animación de muerte: el cuerpo queda tirado y desaparece a los 5 s.
    z.die();
    this.corpses.push(z);
    this.hud.update(this.stats());
  },

  /** Suelta monedas físicas al morir un enemigo, repartiendo el presupuesto de
   *  monedas de la oleada. Los zombies sueltan 0-3 monedas de 1/5/10; el jefe,
   *  además, una roja de 50. */
  dropCoins(z) {
    if (z.isBoss) {
      this.spawnCoin(z.position, BOSS_COIN_VALUE); // el jefe solo suelta la moneda roja
      return;
    }
    this.killsLeft = Math.max(0, this.killsLeft - 1);
    let v;
    if (this.killsLeft <= 0) v = this.coinBudget; // último zombie: el resto
    else v = (this.coinBudget / (this.killsLeft + 1)) * rand(0.5, 1.6);
    v = Math.max(0, Math.min(Math.round(v), this.coinBudget, 30));
    this.coinBudget -= v;
    this.spawnCoinValue(z.position, v, 3);
  },

  /** Reparte un valor en monedas (1/5/10) sin pasar de maxCoins. */
  spawnCoinValue(pos, value, maxCoins = 3) {
    let v = value;
    let count = 0;
    for (const d of COIN_DENOMS) {
      while (v >= d && count < maxCoins) { this.spawnCoin(pos, d); v -= d; count += 1; }
    }
  },

  spawnCoin(pos, value) {
    const ox = (Math.random() - 0.5) * 1.3;
    const oz = (Math.random() - 0.5) * 1.3;
    const c = new Item(this, 'coin', pos.x + ox, pos.z + oz, value);
    c.baseY = pos.y + 0.45; // a la altura del enemigo (sirve también en el loft)
    c.mesh.position.y = c.baseY;
    this.items.push(c);
  },

  /** Suelta un cubo de salud según el presupuesto de la oleada, repartido entre
   *  las muertes restantes (garantiza que el presupuesto caiga antes del final). */
  maybeDropHealth(z) {
    if (this.healthBudget <= 0) return;
    const killsIncludingThis = this.killsLeft + 1; // killsLeft ya se decrementó en dropCoins
    const mustDrop = this.healthBudget >= killsIncludingThis;
    if (mustDrop || Math.random() < this.healthBudget / killsIncludingThis) {
      this.items.push(new Item(this, 'health', z.position.x, z.position.z));
      this.healthBudget -= 1;
      this.healthDropped += 1;
    }
  },

  updateCorpses(delta) {
    if (!this.corpses || !this.corpses.length) return;
    for (const c of this.corpses) c.updateCorpse(delta);
    this.corpses = this.corpses.filter((c) => {
      if (c.deathTimer <= 0) { c.destroy(); return false; }
      return true;
    });
  },
};
