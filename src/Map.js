import * as THREE from 'three';

const ROAD_HALF = 4;       // semiancho de calle (asfalto)
const SIDEWALK_HALF = 5.2; // semiancho de banqueta
const ROAD_LINES = [-18, 0, 18]; // cuadrícula de calles en ambos ejes

const TREE_SCALE = 3.2;
const TREE_SMALL_SCALE = 3;
const FENCE_SCALE = 2.0;
const PLANTER_SCALE = 2.4;
const PATH_SCALE = 4;
const TOWER_KEYS = ['cityA', 'cityB', 'cityC'];

// --- Materiales compartidos del mapa (se crean una vez por build) -----------
function makeMaterials() {
  return {
    wall: new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 1 }),
    upper: new THREE.MeshStandardMaterial({ color: 0xc8b894, roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x7d4b3a, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x6f5a40, roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x33414f, emissive: 0x141b22, roughness: 0.35 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x70757b, roughness: 1 }),
  };
}

function quad(scene, w, d, x, z, y, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
}

function noShadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return obj;
}

/** Caja visual simple (sin colisión). */
function addBox(game, x, y, z, sx, sy, sz, mat, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  game.scene.add(m);
  return m;
}

/**
 * Segmento de pared sólido entre las alturas [y0, y1]: malla + huella AABB con
 * rango vertical en game.walls (bloquea solo a esa altura) y, opcionalmente,
 * malla para el raycast de cámara.
 */
function addWall(game, cx, cz, hx, hz, y0, y1, mat, camera = true) {
  const h = y1 - y0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, h, hz * 2), mat);
  m.position.set(cx, y0 + h / 2, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  game.scene.add(m);
  game.walls.addBox(cx, cz, hx, hz, y0, y1);
  if (camera) game.walls.addMesh(m);
  return m;
}

/**
 * Construye el mapa: cuadrícula de calles, casas de dos plantas transitables,
 * edificios sólidos de varios pisos, vallas que colisionan y muros de cobertura.
 */
export function buildMap(game, world) {
  const { scene } = game;
  const span = world * 2;
  const M = makeMaterials();
  const fenceSize = game.models.size('fence');
  const panelLen = (fenceSize ? fenceSize.x : 1.6) * FENCE_SCALE;

  // --- Calles en cuadrícula (banqueta + asfalto) ---
  for (const L of ROAD_LINES) {
    quad(scene, span, SIDEWALK_HALF * 2, 0, L, 0.012, 0x8a8f98);
    quad(scene, SIDEWALK_HALF * 2, span, L, 0, 0.013, 0x8a8f98);
    quad(scene, span, ROAD_HALF * 2, 0, L, 0.02, 0x2f333a);
    quad(scene, ROAD_HALF * 2, span, L, 0, 0.021, 0x2f333a);
  }
  // Líneas amarillas solo en la cruz central (legibilidad).
  quad(scene, span, 0.18, 0, 0, 0.03, 0xd4b53a);
  quad(scene, 0.18, span, 0, 0, 0.031, 0xd4b53a);

  // --- Manzanas: centros en la cuadrícula 4x4 ---
  const C = [-26, -9, 9, 26];
  for (const cz of C) {
    for (const cx of C) {
      const face = cz > 0 ? 's' : 'n'; // puerta hacia la calle (lado del centro)
      const corner = Math.abs(cx) === 26 && Math.abs(cz) === 26;
      const park = (cx === 9 && cz === 9) || (cx === -9 && cz === -9);
      if (corner) {
        buildTower(game, cx, cz, M);
      } else if (park) {
        buildPark(game, cx, cz, M);
      } else {
        buildHouse(game, cx, cz, face, M, panelLen);
      }
    }
  }

  // --- Muros de hormigón sueltos como cobertura ---
  // Posiciones en calles/intersecciones, lejos de las puertas de las casas
  // (columnas x,z = ±9, ±26).
  const coverWalls = [
    [0, 13, 3.2, 0.3], [0, -13, 3.2, 0.3],
    [13, 0, 0.3, 3.2], [-13, 0, 0.3, 3.2],
    [4, 4, 2.0, 0.3], [-4, -4, 0.3, 2.0],
  ];
  for (const [x, z, hx, hz] of coverWalls) addWall(game, x, z, hx, hz, 0, 1.7, M.concrete);

  // --- Cerca perimetral interior (decoración) ---
  for (let x = -world + 4; x < world - 3; x += panelLen) {
    addFenceProp(game, x, -world + 1.5, 0);
    addFenceProp(game, x, world - 1.5, 0);
  }
  for (let z = -world + 4; z < world - 3; z += panelLen) {
    addFenceProp(game, -world + 1.5, z, Math.PI / 2);
    addFenceProp(game, world - 1.5, z, Math.PI / 2);
  }

  // --- Telón de fondo: edificios sólidos fuera del área jugable (skyline) ---
  buildBackdrop(game, world);
}

// --- Casa de dos plantas transitable (escalera interior + loft) --------------
// face solo 's' o 'n' (puerta hacia la calle). El loft ocupa la mitad opuesta a
// la puerta; la otra mitad es de doble altura con la escalera pegada al muro
// oeste.
function buildHouse(game, cx, cz, face, M, panelLen) {
  const W = 7;
  const D = 6;
  const th = 0.18;
  const wallH = 2.6; // altura de la planta baja / nivel del loft
  const upH = 2.0;   // altura de los muros del 2º piso
  const doorW = 2.8;

  const sgn = face === 'n' ? -1 : 1;        // loft hacia el lado opuesto a la puerta
  const doorZ = cz - sgn * (D / 2);         // borde con la puerta (base de escalera)
  const loftZ0 = Math.min(cz, cz + sgn * (D / 2));
  const loftZ1 = Math.max(cz, cz + sgn * (D / 2));

  // Suelo de la planta baja.
  addBox(game, cx, 0.04, cz, W - 0.4, 0.08, D - 0.4, M.floor);

  // --- Paredes de planta baja [0, wallH]; puerta en el lado `face` (muro z) ---
  const zWalls = [
    { z: cz - D / 2, door: face === 's' },
    { z: cz + D / 2, door: face === 'n' },
  ];
  for (const w of zWalls) {
    if (!w.door) {
      addWall(game, cx, w.z, W / 2, th, 0, wallH, M.wall);
    } else {
      const hx = (W - doorW) / 4;
      addWall(game, cx - (doorW / 2 + hx), w.z, hx, th, 0, wallH, M.wall);
      addWall(game, cx + (doorW / 2 + hx), w.z, hx, th, 0, wallH, M.wall);
      addBox(game, cx, wallH - 0.3, w.z, doorW, 0.6, th * 2, M.trim); // dintel
    }
  }
  addWall(game, cx - W / 2, cz, th, D / 2, 0, wallH, M.wall); // oeste
  addWall(game, cx + W / 2, cz, th, D / 2, 0, wallH, M.wall); // este

  // --- Loft transitable (mitad opuesta a la puerta), top = wallH ---
  const loftCz = (loftZ0 + loftZ1) / 2;
  const loftD = loftZ1 - loftZ0;
  addBox(game, cx, wallH - 0.1, loftCz, W - 0.3, 0.2, loftD, M.upper); // losa (top = wallH)
  game.registerPlatform({
    minX: cx - W / 2 + th, maxX: cx + W / 2 - th,
    minZ: loftZ0, maxZ: loftZ1, top: wallH,
  });

  // --- Escalera: rampa CENTRADA bajo la puerta, sube de la puerta al loft ---
  // (centrada para que entrar por la puerta = pisar la base de la rampa, y los
  //  zombies puedan subir siguiendo el campo de flujo).
  const stW = 1.8;
  const stX0 = cx - stW / 2;
  const run = D / 2;
  const rampLen = Math.hypot(run, wallH);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(stW, 0.22, rampLen), M.trim);
  ramp.position.set(stX0 + stW / 2, wallH / 2, (doorZ + cz) / 2);
  ramp.rotation.x = -sgn * Math.atan2(wallH, run);
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  game.scene.add(ramp);
  game.registerPlatform({
    minX: stX0, maxX: stX0 + stW,
    minZ: Math.min(doorZ, cz), maxZ: Math.max(doorZ, cz),
    ramp: { axis: 'z', lowAt: doorZ, highAt: cz, lowTop: 0, highTop: wallH },
  });

  // --- Barandilla del loft (borde z=cz), con hueco en el rellano de escalera ---
  const railTop = wallH + 1.0;
  const gapL = stX0 - 0.1;
  const gapR = stX0 + stW + 0.1;
  if (gapL > cx - W / 2 + 0.1) {
    addWall(game, (cx - W / 2 + gapL) / 2, cz, (gapL - (cx - W / 2)) / 2, th, wallH, railTop, M.trim, false);
  }
  addWall(game, (gapR + cx + W / 2) / 2, cz, ((cx + W / 2) - gapR) / 2, th, wallH, railTop, M.trim, false);

  // --- Muros del 2º piso [wallH, wallH+upH]: cierran arriba (sin tapar cámara) ---
  // Materiales PROPIOS de esta casa para poder fundirla sola al subir al loft.
  // transparent:true desde el inicio para que cambiar opacity NO recompile el
  // shader (si se activa transparent en caliente haría falta needsUpdate).
  const upMat = M.upper.clone(); upMat.transparent = true;
  const roofMat = M.roof.clone(); roofMat.transparent = true;
  const glassMat = M.glass.clone(); glassMat.transparent = true;
  const upY0 = wallH;
  const upY1 = wallH + upH;
  addWall(game, cx, cz - D / 2, W / 2, th, upY0, upY1, upMat, false);
  addWall(game, cx, cz + D / 2, W / 2, th, upY0, upY1, upMat, false);
  addWall(game, cx - W / 2, cz, th, D / 2, upY0, upY1, upMat, false);
  addWall(game, cx + W / 2, cz, th, D / 2, upY0, upY1, upMat, false);
  const winY = (upY0 + upY1) / 2;
  for (const ox of [-1.7, 1.7]) {
    addBox(game, cx + ox, winY, cz - D / 2 - 0.06, 0.95, 1.05, 0.08, glassMat, false);
    addBox(game, cx + ox, winY, cz + D / 2 + 0.06, 0.95, 1.05, 0.08, glassMat, false);
  }
  for (const oz of [-1.3, 1.3]) {
    addBox(game, cx - W / 2 - 0.06, winY, cz + oz, 0.08, 1.05, 0.95, glassMat, false);
    addBox(game, cx + W / 2 + 0.06, winY, cz + oz, 0.08, 1.05, 0.95, glassMat, false);
  }

  // --- Tejado a cuatro aguas (pirámide alineada a los muros) ---
  const eaveY = wallH + upH;
  const roofH = 1.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roofMat);
  roof.scale.set((W / 2 + 0.6) / 0.7071, roofH, (D / 2 + 0.6) / 0.7071);
  roof.position.set(cx, eaveY + roofH / 2, cz);
  roof.castShadow = true;
  roof.receiveShadow = true;
  game.scene.add(roof);

  // Fundir tejado+2º piso cuando el jugador entra al loft (cámara despejada).
  game.registerRoof({
    mats: [upMat, roofMat, glassMat],
    minX: cx - W / 2 - 1, maxX: cx + W / 2 + 1,
    minZ: cz - D / 2 - 1, maxZ: cz + D / 2 + 1,
  });

  // --- Jardín cercado (con portón) + caminito + árbol ---
  fenceYard(game, cx, cz, W, D, face, panelLen);
  const dir = face === 's' ? -1 : 1;
  const p = game.models.get('pathStones');
  if (p) {
    noShadow(p);
    p.scale.setScalar(PATH_SCALE);
    p.position.set(cx, 0.014, cz + dir * (D / 2 + 1.4));
    game.scene.add(p);
  }
  addTree(game, 'treeSmall', TREE_SMALL_SCALE, cx + W / 2 + 0.6, cz);
}

// --- Edificio sólido de varios pisos (no se entra) ---------------------------
function buildTower(game, cx, cz, M) {
  const key = TOWER_KEYS[(Math.abs(cx) + Math.abs(cz)) % TOWER_KEYS.length];
  const m = game.models.get(key);
  if (!m) return;
  const size = game.models.size(key);
  const scale = 11 / size.y;
  m.scale.setScalar(scale);
  m.position.set(cx, 0, cz);
  m.updateMatrixWorld(true);
  game.scene.add(m);

  const box = new THREE.Box3().setFromObject(m);
  const bx = (box.min.x + box.max.x) / 2;
  const bz = (box.min.z + box.max.z) / 2;
  const hx = ((box.max.x - box.min.x) / 2) * 0.9;
  const hz = ((box.max.z - box.min.z) / 2) * 0.9;
  game.walls.addBox(bx, bz, hx, hz);
  game.walls.addMesh(m);
}

// --- Parque / plaza ----------------------------------------------------------
function buildPark(game, cx, cz, M) {
  quad(game.scene, 13, 13, cx, cz, 0.011, 0x3f6b3f);
  addTree(game, 'tree', TREE_SCALE, cx, cz);
  for (const [dx, dz] of [[-4, -4], [4, 4], [-4, 4], [4, -4]]) {
    addTree(game, 'treeSmall', TREE_SMALL_SCALE, cx + dx, cz + dz);
  }
  for (const [dx, dz] of [[-4, 0], [4, 0]]) addPlanter(game, cx + dx, cz + dz);
  // Bancos/cobertura baja.
  addWall(game, cx, cz - 5, 2.2, 0.25, 0, 0.9, M.concrete);
  addWall(game, cx, cz + 5, 2.2, 0.25, 0, 0.9, M.concrete);
}

// --- Vallas ------------------------------------------------------------------
function addFenceProp(game, x, z, rotY) {
  const f = game.models.get('fence');
  if (!f) return;
  noShadow(f);
  f.scale.setScalar(FENCE_SCALE);
  f.position.set(x, 0, z);
  f.rotation.y = rotY;
  game.scene.add(f);
}

/** Tramo de valla: props del modelo + caja de colisión (no bloquea la cámara). */
function fenceLine(game, x1, z1, x2, z2, panelLen) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.5) return;
  const horizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const n = Math.max(1, Math.round(len / panelLen));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    addFenceProp(game, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, horizontal ? 0 : Math.PI / 2);
  }
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  if (horizontal) game.walls.addBox(cx, cz, len / 2, 0.15);
  else game.walls.addBox(cx, cz, 0.15, len / 2);
}

function fenceSide(game, x1, z1, x2, z2, gate, panelLen) {
  if (!gate) { fenceLine(game, x1, z1, x2, z2, panelLen); return; }
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const h = gate / 2;
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  fenceLine(game, x1, z1, mx - ux * h, mz - uz * h, panelLen);
  fenceLine(game, mx + ux * h, mz + uz * h, x2, z2, panelLen);
}

function fenceYard(game, cx, cz, W, D, face, panelLen) {
  const YX = W / 2 + 1.4;
  const YZ = D / 2 + 1.4;
  const GATE = 3.4;
  const SW = [cx - YX, cz - YZ];
  const SE = [cx + YX, cz - YZ];
  const NW = [cx - YX, cz + YZ];
  const NE = [cx + YX, cz + YZ];
  fenceSide(game, SW[0], SW[1], SE[0], SE[1], face === 's' ? GATE : 0, panelLen);
  fenceSide(game, NW[0], NW[1], NE[0], NE[1], face === 'n' ? GATE : 0, panelLen);
  fenceSide(game, SW[0], SW[1], NW[0], NW[1], face === 'w' ? GATE : 0, panelLen);
  fenceSide(game, SE[0], SE[1], NE[0], NE[1], face === 'e' ? GATE : 0, panelLen);
}

// --- Decoración --------------------------------------------------------------
function addPlanter(game, x, z) {
  const p = game.models.get('planter');
  if (!p) return;
  p.scale.setScalar(PLANTER_SCALE);
  p.position.set(x, 0, z);
  game.scene.add(p);
}

function addTree(game, key, scale, x, z) {
  const t = game.models.get(key);
  if (!t) return;
  t.scale.setScalar(scale);
  t.position.set(x, 0, z);
  t.rotation.y = Math.random() * Math.PI * 2;
  game.scene.add(t);
}

/** Edificios decorativos fuera del muro perimetral (profundidad de skyline). */
function buildBackdrop(game, world) {
  const keys = ['bA', 'bB', 'bC', 'bD', 'bE', 'bF', 'bG', 'bH'];
  const off = world + 7;
  let i = 0;
  for (let p = -world + 6; p <= world - 6; p += 11) {
    placeBackdrop(game, keys[i++ % keys.length], p, -off, 0);
    placeBackdrop(game, keys[i++ % keys.length], p, off, Math.PI);
    placeBackdrop(game, keys[i++ % keys.length], -off, p, Math.PI / 2);
    placeBackdrop(game, keys[i++ % keys.length], off, p, -Math.PI / 2);
  }
}

function placeBackdrop(game, key, x, z, rotY) {
  const m = game.models.get(key);
  if (!m) return;
  noShadow(m);
  m.scale.setScalar(4.5);
  m.position.set(x, 0, z);
  m.rotation.y = rotY;
  game.scene.add(m);
}
