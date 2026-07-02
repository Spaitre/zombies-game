import * as THREE from 'three';

/**
 * Construye un humanoide a partir de primitivas (torso, cabeza, brazos, piernas)
 * con pivotes en cadera y hombro para poder animar el caminado. Sin assets
 * externos. El origen del grupo está en los pies (y=0), apoyado en el suelo.
 *
 * Devuelve { group, parts, mats, height }.
 */
export function buildHumanoid({ bodyColor, headColor, scale = 1, bulky = false, fullShadow = false }) {
  const g = new THREE.Group();
  const w = bulky ? 1.5 : 1;

  const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 });
  const matHead = new THREE.MeshStandardMaterial({ color: headColor ?? bodyColor, roughness: 0.6 });

  const legLen = 0.5 * scale;
  const legW = 0.17 * scale * w;
  const torsoH = 0.6 * scale;
  const torsoW = 0.5 * scale * w;
  const torsoD = 0.32 * scale * w;
  const armLen = 0.52 * scale;
  const armW = 0.15 * scale * w;
  const headR = 0.23 * scale * (bulky ? 1.15 : 1);
  const hipY = legLen + 0.05;

  const leg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14 * scale * w, hipY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(legW, legLen, legW), matBody);
    mesh.position.y = -legLen / 2;
    mesh.castShadow = fullShadow;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const leftLeg = leg(-1);
  const rightLeg = leg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), matBody);
  torso.position.y = hipY + torsoH / 2;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 14), matHead);
  head.position.y = hipY + torsoH + headR * 0.85;
  head.castShadow = true;
  g.add(head);

  const shoulderY = hipY + torsoH - 0.06 * scale;
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (torsoW / 2 + armW / 2), shoulderY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(armW, armLen, armW), matBody);
    mesh.position.y = -armLen / 2;
    mesh.castShadow = fullShadow;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const leftArm = arm(-1);
  const rightArm = arm(1);

  return {
    group: g,
    parts: { leftLeg, rightLeg, leftArm, rightArm, torso, head },
    mats: { body: matBody, head: matHead },
    height: hipY + torsoH + headR * 2,
    shoulderY,
  };
}

/** Anima el caminado: piernas y brazos oscilan en oposición. */
export function animateWalk(parts, phase, intensity) {
  const s = Math.sin(phase) * intensity;
  parts.leftLeg.rotation.x = s;
  parts.rightLeg.rotation.x = -s;
  parts.leftArm.rotation.x = -s;
  parts.rightArm.rotation.x = s;
}

/** Pose de "zombie": brazos extendidos al frente. */
export function zombiePose(parts) {
  parts.leftArm.rotation.x = -1.3;
  parts.rightArm.rotation.x = -1.3;
}
