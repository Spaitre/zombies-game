/**
 * Audio sintetizado con Web Audio API: sin archivos externos. Genera todos los
 * efectos con osciladores y ruido. El AudioContext se crea/reanuda con el primer
 * gesto del usuario (requisito de los navegadores).
 */
export default class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.5;

    const resume = () => this.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    window.addEventListener('touchstart', resume);
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // --- Primitivas ---
  tone({ freq = 440, freq2 = null, dur = 0.15, type = 'sine', gain = 0.3, attack = 0.005, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.3, type = 'lowpass', freq = 1000, q = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    n.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + dur);
  }

  // --- Efectos del juego ---
  shoot(weapon) {
    if (weapon === 'shotgun') {
      this.noise({ dur: 0.18, gain: 0.4, freq: 2200 });
      this.tone({ freq: 150, freq2: 55, dur: 0.13, type: 'square', gain: 0.18 });
    } else if (weapon === 'rifle') {
      this.noise({ dur: 0.05, gain: 0.22, freq: 3200, type: 'highpass' });
      this.tone({ freq: 440, freq2: 180, dur: 0.05, type: 'square', gain: 0.12 });
    } else if (weapon === 'grenade') {
      this.tone({ freq: 220, freq2: 90, dur: 0.18, type: 'sine', gain: 0.28 });
    } else {
      this.noise({ dur: 0.07, gain: 0.22, freq: 1800 });
      this.tone({ freq: 330, freq2: 140, dur: 0.07, type: 'square', gain: 0.14 });
    }
  }

  zombieDeath() {
    this.tone({ freq: 200, freq2: 55, dur: 0.22, type: 'sawtooth', gain: 0.18 });
    this.noise({ dur: 0.16, gain: 0.12, freq: 700 });
  }

  explosion() {
    this.noise({ dur: 0.5, gain: 0.5, freq: 500 });
    this.tone({ freq: 120, freq2: 38, dur: 0.5, type: 'sine', gain: 0.38 });
  }

  pickup() {
    this.tone({ freq: 520, dur: 0.1, type: 'sine', gain: 0.22 });
    this.tone({ freq: 784, dur: 0.12, type: 'sine', gain: 0.22, delay: 0.09 });
  }

  bossSpawn() {
    this.tone({ freq: 90, freq2: 50, dur: 0.9, type: 'sawtooth', gain: 0.45 });
    this.tone({ freq: 140, freq2: 70, dur: 0.9, type: 'square', gain: 0.18 });
  }

  hurt() {
    this.tone({ freq: 220, freq2: 110, dur: 0.16, type: 'square', gain: 0.22 });
  }

  waveStart() {
    [330, 440, 554].forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.2, delay: i * 0.09 }));
  }

  gameOver() {
    [440, 330, 220, 147].forEach((f, i) => this.tone({ freq: f, dur: 0.32, type: 'sawtooth', gain: 0.26, delay: i * 0.18 }));
  }

  ui() {
    this.tone({ freq: 600, dur: 0.05, type: 'square', gain: 0.14 });
  }
}
