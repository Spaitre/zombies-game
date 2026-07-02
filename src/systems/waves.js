// Oleadas: aparición de enemigos, jefe, tipo de zombie y cierre de oleada.
// Mixin de Game (los métodos usan `this` = instancia de Game).
import Zombie from '../entities/Zombie.js';
import Item from '../entities/Item.js';
import { WEAPON_ORDER } from '../weapons.js';
import { rand, dist2, enemyCount } from './shared.js';

export default {
  startNextWave() {
    this.wave += 1;
    const bossWave = this.wave % 5 === 0;
    this.toSpawn = bossWave ? 4 : enemyCount(this.wave);
    this.spawnTimer = 0;
    this.spawnInterval = Math.max(0.25, 0.85 - this.wave * 0.04);

    // Presupuesto de monedas que repartirán los enemigos (crece cada oleada).
    // Oleada 1 ≈ 20-30 de valor total.
    const target = 25 * (1 + (this.wave - 1) * 0.6);
    this.coinBudget = Math.round(target * rand(0.85, 1.15));
    this.killsLeft = this.toSpawn; // zombies normales que repartirán el presupuesto
    this.waveCleared = false;
    this.waveEndTimer = 0;

    // Cubos de salud: 0-2 por oleada. Si la oleada anterior soltó 0 (y no es la
    // oleada 1), esta garantiza al menos 1.
    this.lastWaveHealth = this.healthDropped || 0;
    let hb = Math.floor(Math.random() * 3); // 0, 1 o 2
    if (this.wave > 1 && this.lastWaveHealth === 0) hb = Math.max(1, hb);
    this.healthBudget = hb;
    this.healthDropped = 0;

    const next = WEAPON_ORDER.find((k) => !this.player.owned.has(k));
    if (next) {
      const p = this.randomOpenPosition(8);
      this.items.push(new Item(this, 'weapon', p.x, p.z, next));
    }

    if (bossWave) this.spawnBoss();
    this.hud.update(this.stats());
    this.hud.announce(bossWave ? `DÍA ${this.wave} · ¡JEFE!` : `DÍA ${this.wave}`);
    this.fx.sound('waveStart');
  },

  spawnZombie() {
    let x;
    let z;
    do {
      const side = Math.floor(Math.random() * 4);
      const m = this.worldSize - 1.5;
      if (side === 0) { x = -m; z = rand(-m, m); }
      else if (side === 1) { x = m; z = rand(-m, m); }
      else if (side === 2) { x = rand(-m, m); z = -m; }
      else { x = rand(-m, m); z = m; }
    } while (dist2(x, z, this.player.position.x, this.player.position.z) < 100);
    this.zombies.push(new Zombie(this, this.pickType(), x, z, this.wave));
  },

  spawnBoss() {
    const boss = new Zombie(this, 'boss', 0, -(this.worldSize - 3), this.wave);
    this.zombies.push(boss);
    this.boss = boss;
    this.hud.showBossBar();
    this.fx.sound('bossSpawn');
  },

  pickType() {
    const r = Math.random();
    if (this.wave >= 5 && r < 0.18) return 'tank';
    if (this.wave >= 3 && r < 0.5) return 'runner';
    return 'walker';
  },

  updateWaves(delta) {
    if (this.toSpawn > 0) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        this.spawnZombie();
        this.toSpawn -= 1;
        this.spawnTimer = this.spawnInterval;
      }
    }
    // Día despejado: muestra "DÍA N COMPLETADO" 5 s (para recoger monedas) y
    // luego vuelve al menú entre niveles (seguir o mejorar).
    if (this.toSpawn === 0 && this.zombies.length === 0) {
      if (!this.waveCleared) {
        this.waveCleared = true;
        this.waveEndTimer = 5;
        this.hud.announce(`DÍA ${this.wave} COMPLETADO`, 4800);
        this.fx.sound('waveStart');
      } else {
        this.waveEndTimer -= delta;
        if (this.waveEndTimer <= 0) this.openShop();
      }
    }
  },

  updateBossBar() {
    if (this.boss && this.boss.alive) {
      this.hud.updateBossBar(this.boss.hp / this.boss.maxHp);
    }
  },
};
