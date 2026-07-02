/**
 * Maneja teclado y mouse. Expone el set de teclas, la posición del puntero en
 * coordenadas normalizadas (NDC) para el raycaster, y si el botón está presionado.
 */
export default class Input {
  constructor(domElement) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0 }; // NDC [-1, 1] (solo de respaldo, sin lock)
    this.firing = false;
    this.aimDown = false; // botón derecho (apuntar, estilo RE2)
    this.dom = domElement;
    this.touchMove = { x: 0, z: 0 }; // lo escribe TouchControls
    this.touchAim = null;
    this.touchJump = false;

    // Mira fija + giro de cámara con el mouse (pointer-lock).
    this.pointerLocked = false;
    this.lookDX = 0; // acumula movimiento horizontal del mouse entre frames
    this.lookDY = 0; // acumula movimiento vertical (apuntar arriba/abajo)

    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault(); // evita el scroll de página
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMove = (e) => {
      if (document.pointerLockElement === this.dom) {
        this.lookDX += e.movementX || 0; // girar cámara
        this.lookDY += e.movementY || 0; // apuntar arriba/abajo
        return;
      }
      const r = this.dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };
    this._onDown = (e) => {
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aimDown = true;
    };
    this._onUp = (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aimDown = false;
    };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      if (!this.pointerLocked) this.firing = false; // soltar disparo al perder el lock
    };
    // Si el cursor sale de la ventana, deja de girar (evita giro infinito).
    this._onLeave = () => { this.pointer.x = 0; this.pointer.y = 0; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.dom.addEventListener('mousemove', this._onMove);
    this.dom.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mouseleave', this._onLeave);
    window.addEventListener('blur', this._onLeave);
    // Evita el menú contextual al jugar.
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Devuelve el giro acumulado del mouse y lo reinicia. */
  consumeLookDX() {
    const d = this.lookDX;
    this.lookDX = 0;
    return d;
  }

  consumeLookDY() {
    const d = this.lookDY;
    this.lookDY = 0;
    return d;
  }

  /** Vector de movimiento en el plano XZ. El joystick táctil tiene prioridad. */
  moveVector() {
    if (this.touchMove && (this.touchMove.x !== 0 || this.touchMove.z !== 0)) {
      return this.touchMove;
    }
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    return { x, z };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.dom.removeEventListener('mousemove', this._onMove);
    this.dom.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mouseup', this._onUp);
  }
}
