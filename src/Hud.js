const HIGHSCORE_KEY = 'zombies-highscore';

/** Capa de UI en DOM por encima del canvas 3D. */
export default class Hud {
  constructor() {
    this.hpText = document.getElementById('hp-text');
    this.scoreText = document.getElementById('score-text');
    this.coinsText = document.getElementById('coins-text');
    this.waveText = document.getElementById('wave-text');
    this.weaponText = document.getElementById('weapon-text');
    this.hpBar = document.getElementById('hpbar');
    this.announceEl = document.getElementById('announce');

    this.bossBar = document.getElementById('boss-bar');
    this.bossFill = document.getElementById('boss-bar-fill');

    this.menuEl = document.getElementById('menu');
    this.shopEl = document.getElementById('shop');
    this.gameoverEl = document.getElementById('gameover');
    this.shopCoins = document.getElementById('shop-coins');
    this.shopDay = document.getElementById('shop-day');
    this.shopGrid = document.getElementById('shop-grid');

    this.goWave = document.getElementById('go-wave');
    this.goScore = document.getElementById('go-score');
    this.goRecord = document.getElementById('go-record');

    this.damageFlash = document.getElementById('damage-flash');
    this.vignette = document.getElementById('vignette');
    this._announceTimer = null;
    this._flashTimer = null;
    this.audio = null; // lo asigna Game

    const mute = document.getElementById('mute-btn');
    mute.onclick = () => {
      const m = this.audio ? this.audio.toggleMute() : false;
      mute.textContent = m ? '🔇' : '🔊';
    };
  }

  update({ hp, maxHp, score, coins, wave, dayLabel, weapon, ammo, magSize, reloading }) {
    this.hpText.textContent = `Vida: ${Math.max(0, Math.round(hp))}`;
    this.scoreText.textContent = `Puntos: ${score}`;
    this.coinsText.textContent = `Monedas: ${coins}`;
    this.waveText.textContent = dayLabel || `Día: ${wave}`;
    this.hpBar.style.width = `${236 * Math.max(0, hp / maxHp)}px`;
    if (weapon) {
      if (reloading) this.weaponText.textContent = `${weapon} · RECARGANDO…`;
      else if (ammo != null) this.weaponText.textContent = `${weapon} · ${ammo}/${magSize}`;
      else this.weaponText.textContent = weapon;
    }
    this.vignette.classList.toggle('show', hp / maxHp < 0.3);
  }

  /** Destello rojo al recibir daño. */
  flashDamage() {
    this.damageFlash.style.opacity = '0.45';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this.damageFlash.style.opacity = '0'; }, 60);
  }

  announce(text, duration = 1400) {
    this.announceEl.textContent = text;
    this.announceEl.style.opacity = '1';
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => { this.announceEl.style.opacity = '0'; }, duration);
  }

  // --- Barra de jefe ---
  showBossBar() { this.bossBar.style.display = 'block'; this.bossFill.style.width = '100%'; }
  hideBossBar() { this.bossBar.style.display = 'none'; }
  updateBossBar(ratio) { this.bossFill.style.width = `${Math.max(0, ratio) * 100}%`; }

  // --- Pantalla de carga ---
  showLoading() { document.getElementById('loading').classList.add('show'); }
  hideLoading() { document.getElementById('loading').classList.remove('show'); }

  // --- Menú de inicio ---
  showMenu(onPlay, onUpgrade, onBoss) {
    this.menuEl.classList.add('show');
    document.getElementById('play-btn').onclick = () => {
      if (this.audio) this.audio.ui();
      this.hideMenu();
      onPlay();
    };
    const up = document.getElementById('upgrade-btn');
    if (up) up.onclick = () => { if (this.audio) this.audio.ui(); if (onUpgrade) onUpgrade(); };
    const boss = document.getElementById('boss-btn');
    if (boss) boss.onclick = () => { if (this.audio) this.audio.ui(); if (onBoss) onBoss(); };
  }
  hideMenu() { this.menuEl.classList.remove('show'); }

  // --- Menú de dificultad del modo jefe ---
  showBossMenu(onPick, onBack) {
    const el = document.getElementById('bossmenu');
    el.classList.add('show');
    for (const btn of el.querySelectorAll('.boss-diff')) {
      btn.onclick = () => { if (this.audio) this.audio.ui(); this.hideBossMenu(); onPick(btn.dataset.diff); };
    }
    document.getElementById('bossmenu-back').onclick = () => { if (this.audio) this.audio.ui(); if (onBack) onBack(); };
  }
  hideBossMenu() { const el = document.getElementById('bossmenu'); if (el) el.classList.remove('show'); }

  // --- Menú de mejoras (entre niveles y desde el menú principal) ---
  showShop(data, handlers) {
    this.shopEl.classList.add('show');
    this.shopCoins.textContent = data.coins;
    if (this.shopDay) this.shopDay.textContent = data.day;

    const sub = (u) => `Nv ${u.level}/${u.max} · `
      + (u.maxed ? 'MÁX' : `<span class="cost">${u.cost}</span>`);
    const makeBtn = (label, meta, affordable, onClick) => {
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.disabled = !affordable;
      btn.innerHTML = `<div class="name">${label}</div><div class="meta">${meta}</div>`;
      btn.onclick = () => { if (this.audio) this.audio.ui(); onClick(); };
      return btn;
    };
    const section = (title) => {
      const sec = document.createElement('div');
      sec.className = 'up-section';
      sec.innerHTML = `<h3>${title}</h3>`;
      const row = document.createElement('div');
      row.className = 'up-row';
      sec.appendChild(row);
      this.shopGrid.appendChild(sec);
      return row;
    };

    this.shopGrid.innerHTML = '';

    // Mejoras por arma (cada estadística por separado).
    for (const w of data.weapons) {
      const row = section(w.name);
      for (const u of w.stats) {
        const ok = data.coins >= u.cost && !u.maxed;
        row.appendChild(makeBtn(u.name, sub(u), ok, () => handlers.onBuyWeapon(w.key, u.stat)));
      }
    }

    // Mejoras de personaje + curación.
    const prow = section('Personaje');
    for (const u of data.player) {
      const ok = data.coins >= u.cost && !u.maxed;
      prow.appendChild(makeBtn(u.name, sub(u), ok, () => handlers.onBuyPlayer(u.stat)));
    }
    prow.appendChild(makeBtn(
      'Curarse',
      data.canHeal ? `<span class="cost">${data.healCost}</span>` : 'Vida llena',
      data.canHeal && data.coins >= data.healCost,
      () => handlers.onHeal(),
    ));

    // Pie: en modo 'level' → seguir al siguiente día; en 'menu' → volver.
    const level = handlers.mode === 'level';
    const nextBtn = document.getElementById('next-btn');
    const backBtn = document.getElementById('back-btn');
    nextBtn.style.display = level ? '' : 'none';
    backBtn.style.display = level ? 'none' : '';
    if (level) nextBtn.onclick = () => { if (this.audio) this.audio.ui(); handlers.onNext(); };
    else backBtn.onclick = () => { if (this.audio) this.audio.ui(); handlers.onBack(); };
  }
  hideShop() { this.shopEl.classList.remove('show'); }

  // --- Pausa ---
  showPause(onResume, onMenu) {
    document.getElementById('pause').classList.add('show');
    document.getElementById('resume-btn').onclick = () => {
      if (this.audio) this.audio.ui();
      onResume();
    };
    const menuBtn = document.getElementById('pause-menu-btn');
    if (menuBtn) menuBtn.onclick = () => { if (this.audio) this.audio.ui(); if (onMenu) onMenu(); };
  }
  hidePause() { document.getElementById('pause').classList.remove('show'); }

  // --- Game Over ---
  showGameOver(score, wave, onRestart) {
    const prevBest = Number(localStorage.getItem(HIGHSCORE_KEY) || 0);
    const best = Math.max(prevBest, score);
    localStorage.setItem(HIGHSCORE_KEY, String(best));
    const isNew = score > prevBest && score > 0;

    this.goWave.textContent = `Llegaste a la oleada ${wave}`;
    this.goScore.textContent = `Puntos: ${score}`;
    this.goRecord.textContent = `Récord: ${best}${isNew ? '  ¡NUEVO!' : ''}`;
    this.goRecord.className = `rec${isNew ? ' new' : ''}`;
    this.vignette.classList.remove('show');
    this.gameoverEl.classList.add('show');

    document.getElementById('restart-btn').onclick = () => {
      if (this.audio) this.audio.ui();
      this.hideGameOver();
      onRestart();
    };
  }
  hideGameOver() { this.gameoverEl.classList.remove('show'); }
}
