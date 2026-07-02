// Cuentas: crear cuenta / iniciar sesión / invitado, con el progreso guardado en
// el servidor (API en server.js). Mixin de Game.
//
// Flujo: al cargar, la "puerta" (showAccountGate) decide — token válido → menú
// con sesión; invitado recordado → menú; si no → pantalla de cuenta. Como
// invitado el progreso vive solo en localStorage (igual que siempre); con sesión,
// cada saveProgress también se sube a la cuenta (pushProgress).

export default {
  /** Base de la API: mismo origen en producción; localhost:4173 en Vite dev. */
  apiUrl(path) {
    const base = window.location.port === '5173' ? 'http://localhost:4173' : '';
    return `${base}${path}`;
  },

  // Métodos (no getters: Object.assign congelaría el valor del getter al mixear).
  sessionUser() { return localStorage.getItem('zombies-user') || null; },
  sessionToken() { return localStorage.getItem('zombies-token') || null; },

  async _api(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.sessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(this.apiUrl(path), {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  },

  /** Puerta de entrada tras cargar: sesión → menú; invitado → menú; si no, cuenta. */
  async showAccountGate() {
    if (this.sessionToken()) {
      try {
        const { user, progress } = await this._api('/api/progress');
        this._sessionIn(user, progress);
        this.showMainMenu();
        return;
      } catch { this._sessionOut(); /* token inválido/servidor caído → puerta */ }
    }
    if (localStorage.getItem('zombies-guest') === '1') { this.showMainMenu(); return; }
    this.showAccountScreen();
  },

  showAccountScreen() {
    this.state = 'menu';
    this.hud.hideMenu();
    this.hud.showAccount({
      user: this.sessionUser(),
      onRegister: (u, p) => this.accountRegister(u, p),
      onLogin: (u, p) => this.accountLogin(u, p),
      onGuest: () => {
        try { localStorage.setItem('zombies-guest', '1'); } catch { /* sin storage */ }
        this.hud.hideAccount();
        this.showMainMenu();
      },
      onLogout: () => { this._sessionOut(); this.showAccountScreen(); },
    });
  },

  /** Crear cuenta: sube el progreso local actual a la cuenta nueva. */
  async accountRegister(user, pass) {
    try {
      const r = await this._api('/api/register', 'POST', { user, pass, progress: this.loadProgress() });
      this._sessionIn(r.user, r.progress, r.token);
      this.hud.hideAccount();
      this.showMainMenu();
    } catch (e) { this.hud.setAccountError(e.message); }
  },

  /** Iniciar sesión: el progreso de la cuenta REEMPLAZA al local. */
  async accountLogin(user, pass) {
    try {
      const r = await this._api('/api/login', 'POST', { user, pass });
      this._sessionIn(r.user, r.progress, r.token);
      this.hud.hideAccount();
      this.showMainMenu();
    } catch (e) { this.hud.setAccountError(e.message); }
  },

  _sessionIn(user, progress, token = null) {
    try {
      if (token) localStorage.setItem('zombies-token', token);
      localStorage.setItem('zombies-user', user);
      if (progress) localStorage.setItem('zombies-progress', JSON.stringify(progress));
    } catch { /* sin storage */ }
    if (this.player) { this.applyProgress(this.player); this.hud.update(this.stats()); }
  },

  _sessionOut() {
    try {
      localStorage.removeItem('zombies-token');
      localStorage.removeItem('zombies-user');
    } catch { /* sin storage */ }
  },

  /** Sube el progreso a la cuenta (throttled; no-op como invitado). */
  pushProgress(data) {
    if (!this.sessionToken()) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this._api('/api/progress', 'PUT', { progress: data }).catch(() => { /* reintenta al próximo save */ });
    }, 800);
  },
};
