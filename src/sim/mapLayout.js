/**
 * Datos de COLISIÓN del mapa, generados con matemática pura (sin Three.js ni
 * modelos): las mismas cajas AABB y plataformas que registra `src/Map.js` al
 * construir el vecindario, para que un servidor headless tenga un mundo
 * IDÉNTICO al del cliente.
 *
 * ⚠️ DUPLICACIÓN CONTROLADA: la geometría replica a `Map.js` (casas, vallas,
 * coberturas, parques) más las huellas medidas de las torres (dependen del
 * modelo .glb, inaccesible en el servidor). Si cambias el layout en `Map.js`,
 * cambia esto igual — hay una verificación que compara ambos mundos caja a
 * caja (ver README, "mundo headless").
 */

// Huella de colisión de las torres de esquina (modelo cityB escalado a altura
// 11, bbox × 0.9). Medida en el cliente; centrada exactamente en (cx, cz).
const TOWER_HX = 4.8978;
const TOWER_HZ = 6.042;

// Misma cuadrícula y dimensiones que Map.js.
const BLOCK_CENTERS = [-26, -9, 9, 26];
const HOUSE = { W: 7, D: 6, th: 0.18, wallH: 2.6, upH: 2.0, doorW: 2.8 };
const YARD_GATE = 3.4;

/**
 * Genera el layout de colisión del vecindario (independiente del tamaño del
 * arena; el vecindario siempre ocupa el centro, igual que en el cliente).
 * Devuelve { boxes: [{cx,cz,hx,hz,y0,y1}], platforms: [...] }.
 */
export function buildLayout() {
  const boxes = [];
  const platforms = [];
  const addBox = (cx, cz, hx, hz, y0 = 0, y1 = Infinity) => boxes.push({ cx, cz, hx, hz, y0, y1 });

  for (const cz of BLOCK_CENTERS) {
    for (const cx of BLOCK_CENTERS) {
      const corner = Math.abs(cx) === 26 && Math.abs(cz) === 26;
      const park = (cx === 9 && cz === 9) || (cx === -9 && cz === -9);
      if (corner) {
        addBox(cx, cz, TOWER_HX, TOWER_HZ); // torre sólida (huella medida)
      } else if (park) {
        // Bancos/cobertura baja del parque.
        addBox(cx, cz - 5, 2.2, 0.25, 0, 0.9);
        addBox(cx, cz + 5, 2.2, 0.25, 0, 0.9);
      } else {
        houseLayout(cx, cz, cz > 0 ? 's' : 'n', addBox, platforms);
      }
    }
  }

  // Muros de hormigón sueltos (cobertura), igual que Map.js.
  const coverWalls = [
    [0, 13, 3.2, 0.3], [0, -13, 3.2, 0.3],
    [13, 0, 0.3, 3.2], [-13, 0, 0.3, 3.2],
    [4, 4, 2.0, 0.3], [-4, -4, 0.3, 2.0],
  ];
  for (const [x, z, hx, hz] of coverWalls) addBox(x, z, hx, hz, 0, 1.7);

  return { boxes, platforms };
}

// Casa de dos plantas: paredes con hueco de puerta, barandillas, muros del 2º
// piso, loft transitable y escalera-rampa (misma aritmética que Map.buildHouse).
function houseLayout(cx, cz, face, addBox, platforms) {
  const { W, D, th, wallH, upH, doorW } = HOUSE;
  const sgn = face === 'n' ? -1 : 1;
  const doorZ = cz - sgn * (D / 2);
  const loftZ0 = Math.min(cz, cz + sgn * (D / 2));
  const loftZ1 = Math.max(cz, cz + sgn * (D / 2));

  // Paredes z de planta baja (la del lado `face` tiene puerta).
  for (const w of [
    { z: cz - D / 2, door: face === 's' },
    { z: cz + D / 2, door: face === 'n' },
  ]) {
    if (!w.door) {
      addBox(cx, w.z, W / 2, th, 0, wallH);
    } else {
      const hx = (W - doorW) / 4;
      addBox(cx - (doorW / 2 + hx), w.z, hx, th, 0, wallH);
      addBox(cx + (doorW / 2 + hx), w.z, hx, th, 0, wallH);
    }
  }
  addBox(cx - W / 2, cz, th, D / 2, 0, wallH); // oeste
  addBox(cx + W / 2, cz, th, D / 2, 0, wallH); // este

  // Loft transitable y escalera-rampa centrada bajo la puerta.
  platforms.push({
    minX: cx - W / 2 + th, maxX: cx + W / 2 - th,
    minZ: loftZ0, maxZ: loftZ1, top: wallH,
  });
  const stW = 1.8;
  const stX0 = cx - stW / 2;
  platforms.push({
    minX: stX0, maxX: stX0 + stW,
    minZ: Math.min(doorZ, cz), maxZ: Math.max(doorZ, cz),
    ramp: { axis: 'z', lowAt: doorZ, highAt: cz, lowTop: 0, highTop: wallH },
  });

  // Barandilla del loft (con hueco en el rellano de la escalera).
  const railTop = wallH + 1.0;
  const gapL = stX0 - 0.1;
  const gapR = stX0 + stW + 0.1;
  if (gapL > cx - W / 2 + 0.1) {
    addBox((cx - W / 2 + gapL) / 2, cz, (gapL - (cx - W / 2)) / 2, th, wallH, railTop);
  }
  addBox((gapR + cx + W / 2) / 2, cz, ((cx + W / 2) - gapR) / 2, th, wallH, railTop);

  // Muros del 2º piso.
  const upY0 = wallH;
  const upY1 = wallH + upH;
  addBox(cx, cz - D / 2, W / 2, th, upY0, upY1);
  addBox(cx, cz + D / 2, W / 2, th, upY0, upY1);
  addBox(cx - W / 2, cz, th, D / 2, upY0, upY1);
  addBox(cx + W / 2, cz, th, D / 2, upY0, upY1);

  // Jardín cercado (portón en el lado de la puerta).
  yardLayout(cx, cz, W, D, face, addBox);
}

function yardLayout(cx, cz, W, D, face, addBox) {
  const YX = W / 2 + 1.4;
  const YZ = D / 2 + 1.4;
  const SW = [cx - YX, cz - YZ];
  const SE = [cx + YX, cz - YZ];
  const NW = [cx - YX, cz + YZ];
  const NE = [cx + YX, cz + YZ];
  fenceSide(SW, SE, face === 's' ? YARD_GATE : 0, addBox);
  fenceSide(NW, NE, face === 'n' ? YARD_GATE : 0, addBox);
  fenceSide(SW, NW, 0, addBox);
  fenceSide(SE, NE, 0, addBox);
}

function fenceRun(x1, z1, x2, z2, addBox) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.5) return;
  const horizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  if (horizontal) addBox(cx, cz, len / 2, 0.15);
  else addBox(cx, cz, 0.15, len / 2);
}

function fenceSide([x1, z1], [x2, z2], gate, addBox) {
  if (!gate) { fenceRun(x1, z1, x2, z2, addBox); return; }
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const h = gate / 2;
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  fenceRun(x1, z1, mx - ux * h, mz - uz * h, addBox);
  fenceRun(mx + ux * h, mz + uz * h, x2, z2, addBox);
}
