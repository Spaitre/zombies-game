// Modo jefe: un nivel único por dificultad. Los enemigos usan los parámetros de
// un nivel de campaña (50/100/150/200); salen 50 en total, máx 12 a la vez, cada
// 2 s, con mezcla 55/30/15 (zombie/esqueleto/fantasma). Los jefes salen a los
// segundos configurados con el doble de vida. Mapa ×3. Mixin de Game.
import Zombie from '../entities/Zombie.js';
import {
  BOSS_MODES, BOSS_MODE_TOTAL, BOSS_MODE_MAX_ALIVE, BOSS_MODE_INTERVAL,
  BOSS_MODE_HP_MULT, BOSS_MODE_WORLD_MULT, BOSS_MODE_MIX, WORLD, rand, dist2,
} from './shared.js';

export default {
  startBossMode(diffKey) {
    const cfg = BOSS_MODES[diffKey];
    if (!cfg) return;
    this.mode = 'boss';
    this.setWorldSize(WORLD * BOSS_MODE_WORLD_MULT); // mapa triple
    this.prepare(); // crea el jugador (con loadout de campaña) y limpia entidades

    this.hud.hideMenu();
    this.hud.hideBossMenu();
    this.hud.hideGameOver();
    this.hud.hideShop();

    this.bossCfg = cfg;
    this.wave = cfg.level;              // nivel en el que se basan los enemigos
    this.bossToSpawn = BOSS_MODE_TOTAL; // enemigos normales que faltan por aparecer
    this.bossSpawnTimer = BOSS_MODE_INTERVAL; // primer enemigo a los 2 s
    this.bossElapsed = 0;
    this.bossQueue = cfg.bossTimes.slice(); // tiempos de aparición de los jefes
    this.bossLevelDone = false;

    this.state = 'playing';
    this.lockPointer();
    this.hud.update(this.stats());
    this.hud.announce(`MODO JEFE · ${cfg.label}`, 2500);
    this.fx.sound('waveStart');
  },

  updateBossLevel(delta) {
    this.bossElapsed += delta;

    // Aparición de enemigos normales: cada intervalo, si no se supera el máximo.
    if (this.bossToSpawn > 0) {
      this.bossSpawnTimer -= delta;
      if (this.bossSpawnTimer <= 0) {
        const aliveNormal = this.zombies.reduce((n, z) => n + (z.isBoss ? 0 : 1), 0);
        if (aliveNormal < BOSS_MODE_MAX_ALIVE) {
          this.spawnBossModeEnemy();
          this.bossToSpawn -= 1;
        }
        this.bossSpawnTimer = BOSS_MODE_INTERVAL;
      }
    }

    // Aparición de jefes en sus tiempos programados.
    while (this.bossQueue.length && this.bossElapsed >= this.bossQueue[0]) {
      this.bossQueue.shift();
      this.spawnBossModeBoss();
    }

    // La barra de jefe sigue a cualquier jefe vivo (soporta varios jefes).
    const aliveBoss = this.zombies.find((z) => z.isBoss && z.alive);
    if (aliveBoss) {
      this.boss = aliveBoss;
      this.hud.showBossBar();
      this.hud.updateBossBar(aliveBoss.hp / aliveBoss.maxHp);
    } else {
      this.boss = null;
      this.hud.hideBossBar();
    }

    // Victoria: todos los enemigos y jefes aparecieron y murieron.
    if (!this.bossLevelDone && this.bossToSpawn === 0 && this.bossQueue.length === 0
      && this.zombies.length === 0) {
      this.bossLevelDone = true;
      this.bossLevelVictory();
    }
  },

  spawnBossModeEnemy() {
    const r = Math.random();
    let type = 'tank';
    for (const [t, thr] of BOSS_MODE_MIX) { if (r <= thr) { type = t; break; } }
    const p = this.bossSpawnEdge(false);
    this.zombies.push(new Zombie(this, type, p.x, p.z, this.bossCfg.level));
  },

  spawnBossModeBoss() {
    const p = this.bossSpawnEdge(true);
    const boss = new Zombie(this, 'boss', p.x, p.z, this.bossCfg.level, BOSS_MODE_HP_MULT);
    this.zombies.push(boss);
    this.boss = boss;
    this.hud.showBossBar();
    this.fx.sound('bossSpawn');
  },

  /** Posición en un borde del arena, lejos del jugador. */
  bossSpawnEdge(boss) {
    const m = this.worldSize - (boss ? 5 : 2);
    let x = 0;
    let z = 0;
    for (let i = 0; i < 20; i += 1) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = -m; z = rand(-m, m); }
      else if (side === 1) { x = m; z = rand(-m, m); }
      else if (side === 2) { x = rand(-m, m); z = -m; }
      else { x = rand(-m, m); z = m; }
      if (dist2(x, z, this.player.position.x, this.player.position.z) > 400) break;
    }
    return { x, z };
  },

  bossLevelVictory() {
    this.state = 'over'; // detiene la simulación; el render sigue
    this.unlockPointer();
    this.hud.hideBossBar();
    this.hud.announce('¡NIVEL COMPLETADO!', 3500);
    this.fx.sound('waveStart');
    setTimeout(() => this.showMainMenu(), 3200);
  },
};
