// Menú de mejoras (entre niveles y desde el menú principal). Cada arma mejora sus
// 4 estadísticas por separado (daño, cadencia, cargador, recarga) y el personaje
// sube vida/velocidad. Todo se paga con monedas, que persisten durante la partida.
// Mixin de Game (`this` = instancia de Game).
import { WEAPONS, WEAPON_ORDER } from '../weapons.js';
import {
  WEAPON_UPGRADES, PLAYER_UPGRADES, MAX_WEAPON_LEVEL, MAX_PLAYER_LEVEL, upgradeCost,
} from './shared.js';

export default {
  /** Menú entre niveles: se abre tras completar un día (seguir o mejorar). */
  openShop() {
    this.state = 'shop';
    this.unlockPointer(); // cursor libre para el menú
    this.saveProgress();  // persiste las monedas recogidas en el día
    this.refreshShop('level');
  },

  /** Menú de mejoras abierto desde el menú principal (loadout/previsualización). */
  openUpgradeMenu() {
    this.hud.hideMenu();
    this.refreshShop('menu');
  },

  /** Estado completo del menú de mejoras para el HUD. */
  menuData() {
    const p = this.player;
    const weapons = WEAPON_ORDER.filter((k) => p.owned.has(k)).map((k) => ({
      key: k,
      name: WEAPONS[k].name,
      stats: Object.keys(WEAPON_UPGRADES).map((stat) => {
        const level = p.weaponUpgrades[k][stat];
        return {
          stat, name: WEAPON_UPGRADES[stat].name, level, max: MAX_WEAPON_LEVEL,
          cost: upgradeCost(level), maxed: level >= MAX_WEAPON_LEVEL,
        };
      }),
    }));
    const player = Object.keys(PLAYER_UPGRADES).map((stat) => {
      const level = p.playerUpgrades[stat];
      return {
        stat, name: PLAYER_UPGRADES[stat].name, level, max: MAX_PLAYER_LEVEL,
        cost: upgradeCost(level), maxed: level >= MAX_PLAYER_LEVEL,
      };
    });
    return {
      coins: this.coins,
      day: this.wave,
      nextDay: this.wave + 1,
      weapons,
      player,
      healCost: this.healCost(),
      canHeal: p.hp < p.maxHp,
    };
  },

  /** Coste de curación: crece con el día hasta el 5 y luego fijo. */
  healCost() {
    return 10 + (Math.min(Math.max(this.wave, 1), 5) - 1) * 5;
  },

  refreshShop(mode = 'level') {
    this._menuMode = mode;
    this.hud.showShop(this.menuData(), {
      mode,
      onBuyWeapon: (key, stat) => this.buyWeaponUpgrade(key, stat),
      onBuyPlayer: (stat) => this.buyPlayerUpgrade(stat),
      onHeal: () => this.buyHeal(),
      onNext: () => this.nextWaveFromShop(),
      onBack: () => this.closeUpgradeMenu(),
    });
  },

  buyWeaponUpgrade(key, stat) {
    const p = this.player;
    if (!p.owned.has(key)) return;
    const level = p.weaponUpgrades[key][stat];
    if (level >= MAX_WEAPON_LEVEL) return;
    const cost = upgradeCost(level);
    if (this.coins < cost) return;
    this.coins -= cost;
    p.weaponUpgrades[key][stat] += 1;
    this.saveProgress(); // persiste el loadout (también lo usa el modo jefe)
    this.hud.update(this.stats());
    this.refreshShop(this._menuMode);
  },

  buyPlayerUpgrade(stat) {
    const p = this.player;
    const level = p.playerUpgrades[stat];
    if (level >= MAX_PLAYER_LEVEL) return;
    const cost = upgradeCost(level);
    if (this.coins < cost) return;
    this.coins -= cost;
    p.playerUpgrades[stat] += 1;
    if (stat === 'maxHp') p.applyMaxHpUpgrade();
    this.saveProgress(); // persiste el loadout (también lo usa el modo jefe)
    this.hud.update(this.stats());
    this.refreshShop(this._menuMode);
  },

  buyHeal() {
    const cost = this.healCost();
    if (this.coins < cost || this.player.hp >= this.player.maxHp) return;
    this.coins -= cost;
    this.player.heal(Infinity);
    this.saveProgress();
    this.hud.update(this.stats());
    this.refreshShop(this._menuMode);
  },

  /** Empieza el siguiente día (nivel). */
  nextWaveFromShop() {
    this.hud.hideShop();
    this.state = 'playing';
    this.lockPointer();
    this.startNextWave();
  },

  /** Vuelve al menú principal desde el menú de mejoras (modo 'menu'). */
  closeUpgradeMenu() {
    this.hud.hideShop();
    this.showMainMenu();
  },
};
