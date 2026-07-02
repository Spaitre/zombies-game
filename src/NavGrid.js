/**
 * Rejilla de navegación de DOS niveles (planta baja + loft) para que los zombies
 * rodeen paredes y suban escaleras tras el jugador.
 *
 * En vez de A* por agente, calcula un FLOW FIELD con BFS desde la celda+nivel del
 * jugador sobre un grafo de 2·N nodos (N celdas × 2 niveles). Las celdas de
 * escalera conectan ambos niveles. Cada celda guarda hacia qué nodo avanzar.
 * Todos los zombies comparten el campo; se recalcula al cambiar el jugador de
 * celda o de nivel.
 */
export default class NavGrid {
  constructor(world, walls, platforms = [], cell = 1, inflate = 0.7) {
    this.world = world;
    this.cell = cell;
    this.cols = Math.ceil((world * 2) / cell);
    this.rows = this.cols;
    this.N = this.cols * this.rows;

    this.w0 = new Uint8Array(this.N);    // transitable en planta baja
    this.w1 = new Uint8Array(this.N);    // transitable en el loft
    this.stair = new Uint8Array(this.N); // celdas que conectan ambos niveles
    this.next = new Int32Array(2 * this.N);
    this._dist = new Int32Array(2 * this.N);
    this.lastTargetNode = -1;

    // Planta baja: bloqueada por paredes a la altura del suelo [0, 1.8].
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const blocked = walls.blocksPoint({ x: this.colToX(c), z: this.rowToZ(r) }, inflate, 0, 1.8);
        this.w0[r * this.cols + c] = blocked ? 0 : 1;
      }
    }

    // Lofts y escaleras a partir de las plataformas registradas.
    for (const p of platforms) {
      const c0 = Math.max(0, this.toCol(p.minX));
      const c1 = Math.min(this.cols - 1, this.toCol(p.maxX));
      const r0 = Math.max(0, this.toRow(p.minZ));
      const r1 = Math.min(this.rows - 1, this.toRow(p.maxZ));
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const i = r * this.cols + c;
          const pt = { x: this.colToX(c), z: this.rowToZ(r) };
          if (p.ramp) {
            // Rampa: transitable en ambos niveles donde no haya pared.
            if (!walls.blocksPoint(pt, inflate, 0, 1.8)) {
              this.stair[i] = 1; this.w0[i] = 1; this.w1[i] = 1;
            }
          } else if (p.top > 1.0) {
            // Loft: transitable arriba salvo donde haya muro/barandilla.
            if (!walls.blocksPoint(pt, inflate, p.top, 1.6)) this.w1[i] = 1;
          }
        }
      }
    }
  }

  colToX(c) { return -this.world + (c + 0.5) * this.cell; }
  rowToZ(r) { return -this.world + (r + 0.5) * this.cell; }
  toCol(x) { return Math.floor((x + this.world) / this.cell); }
  toRow(z) { return Math.floor((z + this.world) / this.cell); }
  idx(c, r) { return r * this.cols + c; }
  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }
  walkAt(layer, i) { return layer ? this.w1[i] : this.w0[i]; }

  /** Recalcula el campo si el jugador cambió de celda o de nivel. */
  computeFlowField(target, targetLevel = 0) {
    this.computeFlowFieldMulti([{ x: target.x, z: target.z, level: targetLevel }]);
  }

  /**
   * Flow field MULTI-FUENTE (co-op): BFS sembrada con las celdas de todos los
   * objetivos a la vez → cada zombie fluye hacia el jugador vivo más CERCANO
   * (por distancia de camino), al mismo coste que con un solo objetivo.
   * `targets` = [{ x, z, level }].
   */
  computeFlowFieldMulti(targets) {
    const nodes = [];
    for (const t of targets) {
      const tc = Math.max(0, Math.min(this.cols - 1, this.toCol(t.x)));
      const tr = Math.max(0, Math.min(this.rows - 1, this.toRow(t.z)));
      const layer = t.level ? 1 : 0;
      let tcell = this.idx(tc, tr);
      if (!this.walkAt(layer, tcell)) {
        const nn = this.nearestWalkable(tc, tr, layer);
        if (nn < 0) continue;
        tcell = nn;
      }
      nodes.push(layer * this.N + tcell);
    }
    if (!nodes.length) return;
    nodes.sort((a, b) => a - b);
    const key = nodes.join(',');
    if (key === this.lastTargetNode) return; // sin cambios de celda/nivel: cachea
    this.lastTargetNode = key;

    const dist = this._dist;
    dist.fill(-1);
    this.next.fill(-1);
    const queue = [];
    for (const n of nodes) {
      if (dist[n] < 0) { dist[n] = 0; queue.push(n); }
    }
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head]; head += 1;
      const lay = cur >= this.N ? 1 : 0;
      const base = lay ? this.N : 0;
      const cell = cur - base;
      const cc = cell % this.cols;
      const cr = (cell - cc) / this.cols;

      for (const [dc, dr] of D) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.inBounds(nc, nr)) continue;
        const ni = this.idx(nc, nr);
        if (!this.walkAt(lay, ni)) continue;
        if (dc !== 0 && dr !== 0
          && (!this.walkAt(lay, this.idx(cc + dc, cr)) || !this.walkAt(lay, this.idx(cc, cr + dr)))) continue;
        const nnode = base + ni;
        if (dist[nnode] >= 0) continue;
        dist[nnode] = dist[cur] + 1;
        this.next[nnode] = cur;
        queue.push(nnode);
      }

      // Transición de nivel en una escalera (misma celda, otro nivel).
      if (this.stair[cell]) {
        const onode = (lay ? 0 : this.N) + cell;
        if (this.walkAt(lay ? 0 : 1, cell) && dist[onode] < 0) {
          dist[onode] = dist[cur] + 1;
          this.next[onode] = cur;
          queue.push(onode);
        }
      }
    }
  }

  nearestWalkable(c, r, layer) {
    for (let rad = 1; rad < 12; rad += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        for (let dr = -rad; dr <= rad; dr += 1) {
          const nc = c + dc;
          const nr = r + dr;
          if (!this.inBounds(nc, nr)) continue;
          const ni = this.idx(nc, nr);
          if (this.walkAt(layer, ni)) return ni;
        }
      }
    }
    return -1;
  }

  /** Dirección unitaria {x,z} hacia el jugador desde (pos, level), rodeando
   *  paredes y subiendo escaleras. */
  flowDir(pos, level, target) {
    const c = this.toCol(pos.x);
    const r = this.toRow(pos.z);
    if (this.inBounds(c, r)) {
      const cell = this.idx(c, r);
      let lay = level ? 1 : 0;
      if (!this.walkAt(lay, cell) && this.walkAt(lay ? 0 : 1, cell)) lay = lay ? 0 : 1;
      let n = this.next[(lay ? this.N : 0) + cell];
      // Salta transiciones de misma celda (cambio de nivel) para una dirección real.
      let guard = 0;
      while (n >= 0 && (n % this.N) === cell && guard < 3) { n = this.next[n]; guard += 1; }
      if (n >= 0) {
        const ncell = n % this.N;
        const nc = ncell % this.cols;
        const nr = (ncell - nc) / this.cols;
        const dx = this.colToX(nc) - pos.x;
        const dz = this.rowToZ(nr) - pos.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x: dx / len, z: dz / len };
      }
    }
    // Sin camino: ir directo.
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }
}
