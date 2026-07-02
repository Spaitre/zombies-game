/**
 * Controles táctiles tipo twin-stick para móvil:
 *  - Joystick izquierdo: movimiento → input.touchMove {x, z}
 *  - Joystick derecho: apuntar + disparar → input.touchAim {x, z} y input.firing
 * Solo se activa en dispositivos táctiles.
 */
const RADIUS = 55;

export default class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    input.touchMove = { x: 0, z: 0 };
    input.touchAim = null;
    input.touchJump = false;

    if (!this.enabled) return;

    document.getElementById('touch-ui').style.display = 'block';

    // Botón de salto.
    const jumpBtn = document.getElementById('jump-btn');
    if (jumpBtn) {
      jumpBtn.style.display = 'block';
      const set = (v) => (e) => { e.preventDefault(); input.touchJump = v; };
      jumpBtn.addEventListener('touchstart', set(true), { passive: false });
      jumpBtn.addEventListener('touchend', set(false));
      jumpBtn.addEventListener('touchcancel', set(false));
    }

    this.bind('joy-move', (v) => {
      input.touchMove.x = v.x;
      input.touchMove.z = v.y;
    }, () => {
      input.touchMove.x = 0;
      input.touchMove.z = 0;
    });

    this.bind('joy-aim', (v) => {
      if (v.x || v.y) {
        input.touchAim = { x: v.x, z: v.y };
        input.firing = true;
      }
    }, () => {
      input.touchAim = null;
      input.firing = false;
    });
  }

  bind(zoneId, onMove, onEnd) {
    const zone = document.getElementById(zoneId);
    const knob = zone.querySelector('.knob');
    let id = null;
    let ox = 0;
    let oy = 0;

    const start = (e) => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = zone.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      update(e);
    };
    const update = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const dx = t.clientX - ox;
        const dy = t.clientY - oy;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, RADIUS);
        const nx = dx / len;
        const ny = dy / len;
        knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
        onMove({ x: nx * (clamped / RADIUS), y: ny * (clamped / RADIUS) });
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          id = null;
          knob.style.transform = 'translate(0,0)';
          onEnd();
        }
      }
    };

    zone.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
    zone.addEventListener('touchmove', (e) => { e.preventDefault(); update(e); }, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }
}
