// Cámara cinematográfica (RE2): giro por delta, mezcla explorar↔apuntar, lag,
// look-ahead, colisión, retroceso y la retícula/aviso de captura.
// Mixin de Game (`this` = instancia de Game).
import * as THREE from 'three';
import {
  CAM, LOOK_SENS, PITCH_MIN, PITCH_MAX, MAX_RECOIL_PITCH, MAX_RECOIL_YAW,
} from './shared.js';

// Primera persona (tecla V): cámara en los ojos, rango de pitch más amplio.
const FP_EYE = 1.58;        // altura de los ojos sobre los pies
const FP_EYE_DOWNED = 0.6;  // derribado: cámara a ras de suelo
const FP_PITCH = 1.25;      // mirar arriba/abajo casi vertical
const FP_FOV = 74;
const FP_AIM_FOV = 58;

export default {
  /** Punto 3D bajo la retícula (centro de pantalla): raycast contra la escena
   *  (zombies, paredes/edificios) y, si no, el suelo o un punto lejano. Ahí va
   *  exactamente la bala. */
  crosshairTarget(out) {
    out = out || this._pointerHit;
    // 1) Raycast desde el centro de la cámara (centro del viewport).
    this.raycaster.setFromCamera(this._ndcCenter, this.camera);
    const objs = this._aimObjs;
    objs.length = 0;
    for (const z of this.zombies) if (z.alive) objs.push(z.mesh); // enemigos (cabeza/cuerpo)
    for (const m of this.walls.meshes) objs.push(m);              // paredes/edificios
    if (this.groundMesh) objs.push(this.groundMesh);             // suelo
    const hits = this.raycaster.intersectObjects(objs, true);
    // 2) Primer punto de impacto.
    if (hits.length) { out.copy(hits[0].point); return out; }
    // 3) Si no golpea nada (cielo): punto lejano sobre el rayo.
    out.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 5000);
    return out;
  },

  /** Retícula central al apuntar; aviso para capturar el cursor si no está
   *  bloqueado (la cámara solo gira con el cursor capturado). */
  updateAimUI() {
    const ch = this._crosshairEl || (this._crosshairEl = document.getElementById('crosshair'));
    const lh = this._lockHintEl || (this._lockHintEl = document.getElementById('lockhint'));
    // Retícula siempre visible en partida (se puede disparar desde la cadera).
    const playing = this.state === 'playing';
    if (ch) ch.style.display = playing && this.player ? 'block' : 'none';
    const needLock = playing && !this.input.pointerLocked && !(this.touch && this.touch.enabled);
    if (lh) lh.style.display = needLock ? 'block' : 'none';
  },

  /** Suma retroceso de cámara (vertical + leve horizontal), con tope. */
  addRecoil(pitch, yaw) {
    this.recoilPitch = Math.min(MAX_RECOIL_PITCH, this.recoilPitch + pitch);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw + yaw, -MAX_RECOIL_YAW, MAX_RECOIL_YAW);
  },

  /** Giro de cámara SOLO con el delta del mouse capturado (pointer-lock), estilo
   *  shooter moderno. NUNCA se usa la posición del cursor. En táctil, la cámara
   *  sigue al jugador (twin-stick). */
  updateLook(delta) {
    if (this.touch && this.touch.enabled) {
      this.updateCamYaw(delta);
      return;
    }
    if (!this.input.pointerLocked) return; // sin captura no se gira (se pide un clic)
    this.camYaw -= this.input.consumeLookDX() * LOOK_SENS;   // mouse derecha → mirar derecha
    this.camPitch -= this.input.consumeLookDY() * LOOK_SENS; // mouse arriba → mirar arriba
    const lo = this.firstPerson ? -FP_PITCH : PITCH_MIN;
    const hi = this.firstPerson ? FP_PITCH : PITCH_MAX;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, lo, hi);
  },

  updateCamYaw(delta) {
    const facing = this.player.mesh.rotation.y;
    let diff = facing - this.camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camYaw += diff * Math.min(1, delta * 5);
  },

  _aimBlend() { return this.player ? this.player.aimBlend : 0; },

  computeDesiredCamera(out) {
    const ab = this._aimBlend();
    const L = THREE.MathUtils.lerp;
    const dist = L(CAM.exploreDist, CAM.aimDist, ab);
    const height = L(CAM.exploreHeight, CAM.aimHeight, ab);
    const shoulder = L(CAM.exploreShoulder, CAM.aimShoulder, ab);
    const fwdX = Math.sin(this.camYaw);
    const fwdZ = Math.cos(this.camYaw);
    const rightX = -Math.cos(this.camYaw); // derecha de pantalla
    const rightZ = Math.sin(this.camYaw);
    out.set(
      this.player.position.x - fwdX * dist + rightX * shoulder,
      this.player.position.y + height,
      this.player.position.z - fwdZ * dist + rightZ * shoulder,
    );
    // Colisión: nunca atraviesa paredes; se acerca al chocar.
    this._camHead.set(
      this.player.position.x + rightX * shoulder,
      this.player.position.y + 1.55,
      this.player.position.z + rightZ * shoulder,
    );
    this._camDir.subVectors(out, this._camHead);
    const len = this._camDir.length();
    this._camDir.normalize();
    this.camRay.set(this._camHead, this._camDir);
    this.camRay.far = len;
    const hits = this.camRay.intersectObjects(this.walls.meshes, true);
    if (hits.length > 0) {
      out.copy(this._camHead).addScaledVector(this._camDir, hits[0].distance * 0.9);
    }
    return out;
  },

  computeLookTarget(out) {
    const ab = this._aimBlend();
    const L = THREE.MathUtils.lerp;
    const lookRight = L(CAM.exploreLookRight, CAM.aimLookRight, ab);
    const lookHeight = L(CAM.exploreLookHeight, CAM.aimLookHeight, ab);
    const fwdX = Math.sin(this.camYaw);
    const fwdZ = Math.cos(this.camYaw);
    const rightX = -Math.cos(this.camYaw);
    const rightZ = Math.sin(this.camYaw);
    out.set(
      this.player.position.x + rightX * lookRight + fwdX * this._lookAheadAmt,
      this.player.position.y + lookHeight,
      this.player.position.z + rightZ * lookRight + fwdZ * this._lookAheadAmt,
    );
    // Inclinación vertical (apuntar arriba/abajo + retroceso) y retroceso lateral.
    const dx = out.x - this._camDesired.x;
    const dz = out.z - this._camDesired.z;
    const horiz = Math.hypot(dx, dz) || 1;
    out.y += Math.tan(this.camPitch + this.recoilPitch) * horiz;
    out.x += rightX * Math.tan(this.recoilYaw) * horiz;
    out.z += rightZ * Math.tan(this.recoilYaw) * horiz;
    return out;
  },

  snapCamera() {
    this.computeDesiredCamera(this._camDesired);
    this.camera.position.copy(this._camDesired);
    this.computeLookTarget(this._camLookAt);
    this.camera.lookAt(this._camLookAt);
  },

  updateCamera(delta) {
    if (this.firstPerson && this.player) { this.updateCameraFP(delta); return; }
    const ab = this._aimBlend();
    const L = THREE.MathUtils.lerp;
    // Look-ahead: mira un poco hacia delante al avanzar; vuelve al detenerse.
    const aheadTarget = ab < 0.5 ? (this.player.isMoving ? CAM.lookAheadMax : 0) : 0.6;
    this._lookAheadAmt += (aheadTarget - this._lookAheadAmt) * Math.min(1, delta * 3);
    // Zoom (FOV) suave al apuntar.
    const fovTarget = L(CAM.exploreFov, CAM.aimFov, ab);
    if (Math.abs(this.camera.fov - fovTarget) > 0.02) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, delta * 8);
      this.camera.updateProjectionMatrix();
    }
    // Posición con inercia (lag pesado; algo más ágil al apuntar).
    this.computeDesiredCamera(this._camDesired);
    this.camera.position.lerp(this._camDesired, Math.min(1, delta * (5 + ab * 4)));
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - delta * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    // Mira suavizada (rotación cinematográfica, sin tirones).
    this.computeLookTarget(this._lookTargetDesired);
    this._camLookAt.lerp(this._lookTargetDesired, Math.min(1, delta * 7));
    this.camera.lookAt(this._camLookAt);

    // Recuperación suave del retroceso al dejar de disparar.
    const rdecay = Math.min(1, delta * 5);
    this.recoilPitch -= this.recoilPitch * rdecay;
    this.recoilYaw -= this.recoilYaw * rdecay;
  },

  /** Cámara en PRIMERA persona: en los ojos, 1:1 con el mouse (sin lag), con
   *  retroceso y shake. El modelo del jugador está oculto (lo gestiona
   *  Game.applyCameraMode) y el arma cuelga de la cámara como viewmodel. */
  updateCameraFP(delta) {
    const ab = this._aimBlend();
    const p = this.player.position;
    const eye = p.y + (this.player.sim.downed ? FP_EYE_DOWNED : FP_EYE);
    this.camera.position.set(p.x, eye, p.z);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - delta * 2);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
    const pitch = this.camPitch + this.recoilPitch;
    const yaw = this.camYaw + this.recoilYaw;
    const cp = Math.cos(pitch);
    this._camLookAt.set(
      this.camera.position.x + Math.sin(yaw) * cp,
      this.camera.position.y + Math.sin(pitch),
      this.camera.position.z + Math.cos(yaw) * cp,
    );
    this.camera.lookAt(this._camLookAt);

    // Zoom (FOV) suave al apuntar.
    const fovTarget = THREE.MathUtils.lerp(FP_FOV, FP_AIM_FOV, ab);
    if (Math.abs(this.camera.fov - fovTarget) > 0.02) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, delta * 8);
      this.camera.updateProjectionMatrix();
    }

    // Recuperación suave del retroceso.
    const rdecay = Math.min(1, delta * 5);
    this.recoilPitch -= this.recoilPitch * rdecay;
    this.recoilYaw -= this.recoilYaw * rdecay;
  },
};
