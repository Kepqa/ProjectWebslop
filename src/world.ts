import Phaser from 'phaser';

export const TILE = 48;
export const CH = 16; // тайлов в чанке
export const CPX = TILE * CH;

export const K_FLOOR = 0, K_WALL = 1, K_CRATE = 2, K_RAMP = 3, K_PIT = 4, K_TOXIC = 5, K_GRAVE = 6;

export interface GenOpts {
  plateau: number; walls: [number, number]; crates: [number, number];
  pits: boolean; maze: boolean; toxic: boolean; graves: [number, number];
}
export interface Palette {
  floor: number[]; ramp: number[]; wallTop: number; wallFace: number; wallLine: number;
  deco: number; pit: number; toxic: number;
}

interface Chunk { kind: Uint8Array; h: Uint8Array }

export interface Body { x: number; y: number; lvl: number }

export function key2(a: number, b: number) { return ((a & 0xffff) << 16) | (b & 0xffff); }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(a: number, b: number, seed: number) {
  let h = (seed ^ Math.imul(a, 374761393) ^ Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export const isSolidKind = (k: number) => k === K_WALL || k === K_CRATE || k === K_GRAVE;

/**
 * Бесконечная процедурная карта из чанков.
 * Высоты 0..2: на соседний тайл другой высоты можно попасть только через пандус.
 * Уровень сущности: целый на обычном тайле, h+0.5 на пандусе.
 */
export class World {
  private chunks = new Map<number, Chunk>();
  private lastKey = NaN; private lastChunk: Chunk | null = null;
  crateHp = new Map<number, number>();

  constructor(private seed: number, private gen: GenOpts) {}

  private chunk(cx: number, cy: number): Chunk {
    const k = key2(cx, cy);
    if (k === this.lastKey && this.lastChunk) return this.lastChunk;
    let c = this.chunks.get(k);
    if (!c) { c = this.generate(cx, cy); this.chunks.set(k, c); }
    this.lastKey = k; this.lastChunk = c;
    return c;
  }

  private at(tx: number, ty: number): [Chunk, number] {
    const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH);
    return [this.chunk(cx, cy), (ty - cy * CH) * CH + (tx - cx * CH)];
  }

  kind(tx: number, ty: number) { const [c, i] = this.at(tx, ty); return c.kind[i]; }
  height(tx: number, ty: number) { const [c, i] = this.at(tx, ty); return c.h[i]; }
  setKind(tx: number, ty: number, k: number) { const [c, i] = this.at(tx, ty); c.kind[i] = k; }
  kindAtPx(x: number, y: number) { return this.kind(Math.floor(x / TILE), Math.floor(y / TILE)); }

  levelOf(tx: number, ty: number) {
    const [c, i] = this.at(tx, ty);
    return c.kind[i] === K_RAMP ? c.h[i] + 0.5 : c.h[i];
  }

  solid(tx: number, ty: number) { return isSolidKind(this.kind(tx, ty)); }
  solidAtPx(x: number, y: number) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }

  /** Можно ли приземлиться (прыгун): не стена и не пропасть. */
  landable(tx: number, ty: number) { const k = this.kind(tx, ty); return !isSolidKind(k) && k !== K_PIT; }

  blocked(tx: number, ty: number, lvl: number, pitOk = false) {
    const [c, i] = this.at(tx, ty);
    const k = c.kind[i];
    if (isSolidKind(k)) return true;
    if (k === K_PIT) return !pitOk;
    const tl = k === K_RAMP ? c.h[i] + 0.5 : c.h[i];
    return Math.abs(tl - lvl) > 0.5;
  }

  /** Выталкивает круг из непроходимых для его уровня тайлов. Возвращает true, если было столкновение. */
  resolve(e: Body, r: number, pitOk = false): boolean {
    const rr = Math.min(r, 21);
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const tx0 = Math.floor((e.x - rr) / TILE), tx1 = Math.floor((e.x + rr) / TILE);
      const ty0 = Math.floor((e.y - rr) / TILE), ty1 = Math.floor((e.y + rr) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.blocked(tx, ty, e.lvl, pitOk)) continue;
        const ax = tx * TILE, ay = ty * TILE;
        const nx = Math.max(ax, Math.min(e.x, ax + TILE)), ny = Math.max(ay, Math.min(e.y, ay + TILE));
        const dx = e.x - nx, dy = e.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          e.x += (dx / d) * (rr - d); e.y += (dy / d) * (rr - d);
        } else {
          const l = e.x - ax, rt = ax + TILE - e.x, t = e.y - ay, b = ay + TILE - e.y;
          const m = Math.min(l, rt, t, b);
          if (m === l) e.x = ax - rr; else if (m === rt) e.x = ax + TILE + rr;
          else if (m === t) e.y = ay - rr; else e.y = ay + TILE + rr;
        }
      }
    }
    return hit;
  }

  updateLevel(e: Body) {
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    if (!this.blocked(tx, ty, e.lvl, true)) e.lvl = this.levelOf(tx, ty);
  }

  /** Прямая видимость на одном уровне (без стен, обрывов и пропастей). */
  clearLine(x1: number, y1: number, x2: number, y2: number, lvl: number) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.ceil(d / 20);
    for (let i = 1; i < n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n;
      if (this.blocked(Math.floor(x / TILE), Math.floor(y / TILE), lvl)) return false;
    }
    return true;
  }

  /** Проходит ли «толстый» отрезок шириной 2r (для срезания углов по пути). */
  clearWide(x1: number, y1: number, x2: number, y2: number, r: number, lvl: number) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
    const px = (-dy / d) * r, py = (dx / d) * r;
    const n = Math.ceil(d / 16);
    for (let i = 1; i <= n; i++) {
      const x = x1 + (dx * i) / n, y = y1 + (dy * i) / n;
      if (this.blocked(Math.floor(x / TILE), Math.floor(y / TILE), lvl)) return false;
      if (this.blocked(Math.floor((x + px) / TILE), Math.floor((y + py) / TILE), lvl)) return false;
      if (this.blocked(Math.floor((x - px) / TILE), Math.floor((y - py) / TILE), lvl)) return false;
    }
    return true;
  }

  /** Быстро заполняет сетку уровней окна N×N (-99 — непроходимо). */
  levelGrid(ox: number, oy: number, N: number, out: Float32Array) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const [c, idx] = this.at(ox + i, oy + j);
      const k = c.kind[idx];
      out[j * N + i] = isSolidKind(k) || k === K_PIT ? -99 : k === K_RAMP ? c.h[idx] + 0.5 : c.h[idx];
    }
  }

  // ---------- Генерация ----------
  private generate(cx: number, cy: number): Chunk {
    const G = this.gen;
    const kind = new Uint8Array(CH * CH), h = new Uint8Array(CH * CH), res = new Uint8Array(CH * CH);
    const r = mulberry32(hash(cx, cy, this.seed));
    const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
    const I = (x: number, y: number) => y * CH + x;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < CH && y < CH;
    const inner = (x: number, y: number) => x >= 1 && y >= 1 && x < CH - 1 && y < CH - 1;
    const free = (x: number, y: number) => inner(x, y) && !res[I(x, y)] && kind[I(x, y)] === K_FLOOR;

    // Стартовая поляна вокруг (0,0)
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const wx = cx * CH + x + 0.5, wy = cy * CH + y + 0.5;
      if (wx * wx + wy * wy < 64) res[I(x, y)] = 1;
    }

    // Лабиринт комнат: крест из стен с проёмами (стыкуется с соседями через свободную кромку)
    if (G.maze) {
      const mx = ri(6, 9), my = ri(6, 9);
      const gapsV = [ri(1, my - 3), ri(my + 1, CH - 5)], gapsH = [ri(1, mx - 3), ri(mx + 1, CH - 5)];
      for (let y = 1; y < CH - 1; y++) if (!gapsV.some((g) => y >= g && y < g + 3) && !res[I(mx, y)]) kind[I(mx, y)] = K_WALL;
      for (let x = 1; x < CH - 1; x++) if (!gapsH.some((g) => x >= g && x < g + 3) && !res[I(x, my)]) kind[I(x, my)] = K_WALL;
    }

    const rectFree = (x0: number, y0: number, w: number, hh: number) => {
      for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) {
        if (!inside(x, y) || res[I(x, y)] || kind[I(x, y)] !== K_FLOOR) return false;
      }
      return true;
    };
    const ramp = (x: number, y: number, base: number, ox: number, oy: number) => {
      if (!inside(x, y)) return;
      kind[I(x, y)] = K_RAMP; h[I(x, y)] = base;
      for (const [ax, ay] of [[x, y], [x + ox, y + oy], [x - ox, y - oy]]) {
        if (!inside(ax, ay)) continue;
        res[I(ax, ay)] = 1;
        if (kind[I(ax, ay)] === K_WALL && !(ax === x && ay === y)) kind[I(ax, ay)] = K_FLOOR; // пандус не упирается в стену
      }
    };
    const placeRamps = (px: number, py: number, pw: number, ph: number, base: number, count: number) => {
      const sides = [0, 1, 2, 3].sort(() => r() - 0.5).slice(0, count);
      for (const side of sides) {
        const len = side < 2 ? pw : ph;
        const w = Math.min(len - 1, ri(2, 3));
        const off = ri(0, len - w);
        for (let k = 0; k < w; k++) {
          if (side === 0) ramp(px + off + k, py - 1, base, 0, -1);
          if (side === 1) ramp(px + off + k, py + ph, base, 0, 1);
          if (side === 2) ramp(px - 1, py + off + k, base, -1, 0);
          if (side === 3) ramp(px + pw, py + off + k, base, 1, 0);
        }
      }
    };

    // Возвышенность (с пандусами), иногда со вторым ярусом
    if (r() < G.plateau) {
      const pw = ri(5, 10), ph = ri(5, 10);
      const px = ri(2, CH - 2 - pw), py = ri(2, CH - 2 - ph);
      if (rectFree(px - 1, py - 1, pw + 2, ph + 2)) {
        for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) h[I(x, y)] = 1;
        placeRamps(px, py, pw, ph, 0, ri(2, 3));
        if (pw >= 7 && ph >= 7 && r() < 0.55) {
          const iw = ri(3, pw - 4), ih = ri(3, ph - 4);
          const ix = px + ri(2, pw - iw - 2), iy = py + ri(2, ph - ih - 2);
          for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) h[I(x, y)] = 2;
          placeRamps(ix, iy, iw, ih, 1, ri(1, 2));
        }
        for (let y = py - 1; y <= py + ph; y++) for (let x = px - 1; x <= px + pw; x++) {
          if (inside(x, y) && (x === px - 1 || y === py - 1 || x === px + pw || y === py + ph)) res[I(x, y)] = 1;
        }
      }
    }

    // Пропасти: трещины (иногда с мостом) и круглые провалы
    if (G.pits) {
      const cracks = ri(1, 2);
      for (let n = 0; n < cracks; n++) {
        const horiz = r() < 0.5, len = ri(6, 12), width = ri(2, 3);
        const a = ri(2, CH - 3 - len), b = ri(2, CH - 5);
        const bridge = r() < 0.6 ? ri(2, len - 4) : -10;
        let off = 0;
        for (let k = 0; k < len; k++) {
          if (k % 3 === 2) off = Math.max(-2, Math.min(2, off + ri(-1, 1)));
          if (k >= bridge && k < bridge + 3) continue;
          for (let w = 0; w < width; w++) {
            const x = horiz ? a + k : b + off + w, y = horiz ? b + off + w : a + k;
            if (inside(x, y) && x >= 2 && y >= 2 && x < CH - 2 && y < CH - 2 && free(x, y) && h[I(x, y)] === 0) kind[I(x, y)] = K_PIT;
          }
        }
      }
      for (let n = ri(0, 2); n > 0; n--) {
        const hx = ri(3, CH - 4), hy = ri(3, CH - 4), rad = 1.2 + r() * 1.4;
        for (let y = hy - 3; y <= hy + 3; y++) for (let x = hx - 3; x <= hx + 3; x++) {
          if ((x - hx) ** 2 + (y - hy) ** 2 <= rad * rad && free(x, y) && h[I(x, y)] === 0) kind[I(x, y)] = K_PIT;
        }
      }
    }

    // Стены: прямые, Г, П, коридоры
    const walls = ri(G.walls[0], G.walls[1]);
    for (let n = 0; n < walls; n++) {
      const tiles: [number, number][] = [];
      const ox = ri(1, CH - 2), oy = ri(1, CH - 2);
      const shape = ri(0, 3);
      const dx = r() < 0.5 ? 1 : -1, dy = r() < 0.5 ? 1 : -1;
      if (shape === 0) {
        const len = ri(4, 8), horiz = r() < 0.5;
        for (let k = 0; k < len; k++) tiles.push(horiz ? [ox + k * dx, oy] : [ox, oy + k * dy]);
      } else if (shape === 1) {
        const a = ri(3, 6), b = ri(3, 6);
        for (let k = 0; k < a; k++) tiles.push([ox + k * dx, oy]);
        for (let k = 1; k < b; k++) tiles.push([ox + (a - 1) * dx, oy + k * dy]);
      } else if (shape === 2) {
        const w = ri(3, 5), hh = ri(3, 5), open = ri(0, 3);
        for (let k = 0; k < w; k++) { if (open !== 0) tiles.push([ox + k * dx, oy]); if (open !== 1) tiles.push([ox + k * dx, oy + (hh - 1) * dy]); }
        for (let k = 1; k < hh - 1; k++) { if (open !== 2) tiles.push([ox, oy + k * dy]); if (open !== 3) tiles.push([ox + (w - 1) * dx, oy + k * dy]); }
      } else {
        const len = ri(5, 8), gap = ri(2, 3), horiz = r() < 0.5;
        for (let k = 0; k < len; k++) {
          tiles.push(horiz ? [ox + k * dx, oy] : [ox, oy + k * dy]);
          if (k > 1) tiles.push(horiz ? [ox + (k - 2) * dx, oy + (gap + 1) * dy] : [ox + (gap + 1) * dx, oy + (k - 2) * dy]);
        }
      }
      for (const [x, y] of tiles) if (free(x, y)) kind[I(x, y)] = K_WALL;
    }

    // Ядовитые лужи
    if (G.toxic) {
      for (let n = ri(1, 3); n > 0; n--) {
        const hx = ri(2, CH - 3), hy = ri(2, CH - 3), rad = 1.3 + r() * 1.3;
        for (let y = hy - 3; y <= hy + 3; y++) for (let x = hx - 3; x <= hx + 3; x++) {
          if ((x - hx) ** 2 + (y - hy) ** 2 <= rad * rad && free(x, y)) kind[I(x, y)] = K_TOXIC;
        }
      }
    }
    // Могилы (призывают мертвецов, ломаются)
    for (let n = ri(G.graves[0], G.graves[1]); n > 0; n--) {
      const x = ri(2, CH - 3), y = ri(2, CH - 3);
      if (free(x, y)) kind[I(x, y)] = K_GRAVE;
    }
    // Ящики — одиночные и кучки 2x2, ломаются свайпом
    for (let n = ri(G.crates[0], G.crates[1]); n > 0; n--) {
      const x = ri(1, CH - 3), y = ri(1, CH - 3);
      const pile: [number, number][] = r() < 0.35 ? [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] : [[x, y]];
      for (const [px, py] of pile) if (free(px, py)) kind[I(px, py)] = K_CRATE;
    }
    return { kind, h };
  }
}

/**
 * Поле путей: Дейкстра от игрока по окну N×N, 8 направлений без срезания углов,
 * штраф за клетки вплотную к стенам/обрывам (зомби не трутся об углы).
 * nxt[i] — следующий тайл по кратчайшему пути.
 */
export class FlowField {
  static readonly N = 96;
  static INF = 1 << 30;
  ox = 0; oy = 0;
  private dist = new Int32Array(FlowField.N ** 2);
  private tl = new Float32Array(FlowField.N ** 2);
  private pen = new Uint8Array(FlowField.N ** 2);
  private nxt = new Int32Array(FlowField.N ** 2);
  private hn = new Int32Array(FlowField.N ** 2 * 4);
  private hk = new Int32Array(FlowField.N ** 2 * 4);
  private hs = 0;

  private push(n: number, k: number) {
    if (this.hs >= this.hn.length) return;
    let i = this.hs++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.hk[p] <= k) break;
      this.hn[i] = this.hn[p]; this.hk[i] = this.hk[p]; i = p;
    }
    this.hn[i] = n; this.hk[i] = k;
  }
  private pop(): number {
    const top = this.hn[0];
    const n = this.hn[--this.hs], k = this.hk[this.hs];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= this.hs) break;
      if (c + 1 < this.hs && this.hk[c + 1] < this.hk[c]) c++;
      if (this.hk[c] >= k) break;
      this.hn[i] = this.hn[c]; this.hk[i] = this.hk[c]; i = c;
    }
    this.hn[i] = n; this.hk[i] = k;
    return top;
  }

  private ok(a: number, b: number) { const lb = this.tl[b]; return lb !== -99 && Math.abs(lb - this.tl[a]) <= 0.5; }

  compute(world: World, ptx: number, pty: number) {
    const N = FlowField.N, INF = FlowField.INF;
    this.ox = ptx - N / 2; this.oy = pty - N / 2;
    world.levelGrid(this.ox, this.oy, N, this.tl);
    const tl = this.tl, pen = this.pen, dist = this.dist;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const c = j * N + i;
      let p = 0;
      if (tl[c] !== -99) {
        for (let dj = -1; dj <= 1 && !p; dj++) for (let di = -1; di <= 1; di++) {
          const v = tl[c + dj * N + di];
          if (v === -99 || Math.abs(v - tl[c]) > 0.5) { p = 6; break; }
        }
      }
      pen[c] = p;
    }
    dist.fill(INF);
    const start = (pty - this.oy) * N + (ptx - this.ox);
    dist[start] = 0;
    this.hs = 0;
    this.push(start, 0);
    while (this.hs > 0) {
      const d = this.hk[0];
      const c = this.pop();
      if (d > dist[c]) continue;
      const ci = c % N, cj = (c / N) | 0;
      if (ci < 1 || cj < 1 || ci >= N - 1 || cj >= N - 1) continue;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const n = c + dj * N + di;
        if (!this.ok(c, n)) continue;
        if (di && dj && (!this.ok(c, c + di) || !this.ok(c, c + dj * N))) continue;
        const nd = d + (di && dj ? 14 : 10) + pen[n];
        if (nd < dist[n]) { dist[n] = nd; this.push(n, nd); }
      }
    }
    // Следующий шаг для каждой клетки
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const c = j * N + i;
      this.nxt[c] = -1;
      if (dist[c] === INF || c === start) continue;
      let best = dist[c], bn = -1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const n = c + dj * N + di;
        if (dist[n] >= best || !this.ok(c, n)) continue;
        if (di && dj && (!this.ok(c, c + di) || !this.ok(c, c + dj * N))) continue;
        best = dist[n]; bn = n;
      }
      this.nxt[c] = bn;
    }
  }

  private idx(x: number, y: number) {
    const N = FlowField.N;
    const i = Math.floor(x / TILE) - this.ox, j = Math.floor(y / TILE) - this.oy;
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return -1;
    return j * N + i;
  }

  /** -1 — вне окна, INF — недостижимо. */
  distAt(x: number, y: number) {
    const c = this.idx(x, y);
    return c < 0 ? -1 : this.dist[c];
  }

  private cx(c: number) { return (this.ox + (c % FlowField.N) + 0.5) * TILE; }
  private cy(c: number) { return (this.oy + ((c / FlowField.N) | 0) + 0.5) * TILE; }

  /**
   * Точка, к которой стоит идти: следующий тайл пути, а если дальше по пути видно
   * «толстым» лучом — самая дальняя видимая точка (до 4 шагов). null — идти прямо к игроку.
   */
  steer(world: World, x: number, y: number, r: number, lvl: number): { x: number; y: number } | null {
    const c = this.idx(x, y);
    if (c < 0 || this.dist[c] === FlowField.INF) return null;
    let k = this.nxt[c];
    if (k < 0) return null;
    let best = k;
    const rr = Math.min(r, 20) * 0.9;
    for (let s = 0; s < 4; s++) {
      const k2 = this.nxt[k];
      if (k2 < 0) break;
      if (!world.clearWide(x, y, this.cx(k2), this.cy(k2), rr, lvl)) break;
      best = k2; k = k2;
    }
    return { x: this.cx(best), y: this.cy(best) };
  }
}

// ---------- Отрисовка чанка ----------
function shade(c: number, f: number) {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
}

/** Рисует чанк в локальных координатах (0..CPX) — результат запекается в текстуру. */
export function drawChunk(g: Phaser.GameObjects.Graphics, world: World, cx: number, cy: number, P: Palette) {
  const ox = cx * CPX, oy = cy * CPX;
  const r = mulberry32(hash(cx, cy, 99));
  const T = TILE;
  const lvl = (tx: number, ty: number) => (world.kind(tx, ty) === K_RAMP ? world.height(tx, ty) + 0.5 : world.height(tx, ty));
  const FC = P.floor;

  // Пол, плато, пандусы, пропасти, лужи
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T - ox, py = ty * T - oy;
    const k = world.kind(tx, ty), h = world.height(tx, ty);
    if (k === K_RAMP) {
      g.fillStyle(P.ramp[Math.min(h, 1)]).fillRect(px, py, T, T);
      const up = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => world.kind(tx + dx, ty + dy) !== K_RAMP && world.height(tx + dx, ty + dy) === h + 1);
      g.fillStyle(0x000000, 0.2);
      for (let s = 0; s < 4; s++) {
        const o = 4 + s * 11;
        if (!up || up[0] === 0) g.fillRect(px, py + o, T, 4); else g.fillRect(px + o, py, 4, T);
      }
      g.fillStyle(0xffffff, 0.07).fillRect(px, py, T, T);
      continue;
    }
    if (k === K_PIT) {
      g.fillStyle(P.pit).fillRect(px, py, T, T);
      if (world.kind(tx, ty - 1) !== K_PIT) {
        g.fillStyle(shade(FC[0], 0.55)).fillRect(px, py, T, 14);
        g.fillStyle(shade(FC[0], 0.35)).fillRect(px, py + 14, T, 8);
      }
      if (world.kind(tx - 1, ty) !== K_PIT) g.fillStyle(0x000000, 0.5).fillRect(px, py, 4, T);
      if (world.kind(tx + 1, ty) !== K_PIT) g.fillStyle(0x000000, 0.5).fillRect(px + T - 4, py, 4, T);
      if (r() < 0.3) g.fillStyle(0xffffff, 0.06).fillCircle(px + 8 + r() * 32, py + 26 + r() * 16, 1.5);
      continue;
    }
    const base = FC[h];
    g.fillStyle(shade(base, 0.94 + r() * 0.12)).fillRect(px, py, T, T);
    for (let n = 0; n < 2; n++) {
      g.fillStyle(r() < 0.5 ? shade(base, 1.18) : shade(base, 0.8), 0.8);
      g.fillRect(px + r() * (T - 6), py + r() * (T - 6), 2 + r() * 5, 2 + r() * 4);
    }
    if (h === 0 && r() < 0.05) g.fillStyle(P.deco).fillCircle(px + 10 + r() * 28, py + 10 + r() * 28, 3 + r() * 4);
    if (k === K_TOXIC) {
      const tox = (dx: number, dy: number) => world.kind(tx + dx, ty + dy) === K_TOXIC;
      // скругляем только внешние углы лужи
      g.fillStyle(P.toxic, 0.55).fillRoundedRect(px, py, T, T, {
        tl: tox(-1, 0) || tox(0, -1) ? 0 : 16, tr: tox(1, 0) || tox(0, -1) ? 0 : 16,
        bl: tox(-1, 0) || tox(0, 1) ? 0 : 16, br: tox(1, 0) || tox(0, 1) ? 0 : 16,
      });
      g.fillStyle(shade(P.toxic, 1.5), 0.45).fillCircle(px + 10 + r() * 28, py + 10 + r() * 28, 3 + r() * 3);
      g.fillStyle(shade(P.toxic, 1.9), 0.35).fillCircle(px + 8 + r() * 30, py + 8 + r() * 30, 2);
    }
  }

  // Обрывы: южная стенка, кромки, тени у подножия
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T - ox, py = ty * T - oy;
    const k = world.kind(tx, ty);
    if (k === K_RAMP || k === K_PIT) continue;
    const h = world.height(tx, ty);
    if (h === 0) continue;
    const L = lvl(tx, ty);
    const s = lvl(tx, ty + 1), n = lvl(tx, ty - 1), w = lvl(tx - 1, ty), e = lvl(tx + 1, ty);
    if (s < L && world.kind(tx, ty + 1) !== K_RAMP) {
      const fh = 16 * (L - Math.floor(s));
      g.fillStyle(shade(FC[0], 0.8)).fillRect(px, py + T, T, fh * 0.45);
      g.fillStyle(shade(FC[0], 0.55)).fillRect(px, py + T + fh * 0.45, T, fh * 0.55);
      g.fillStyle(0x000000, 0.3).fillRect(px, py + T + fh, T, 10);
      g.fillStyle(shade(FC[h], 1.35)).fillRect(px, py + T - 3, T, 3);
    }
    if (n < L && world.kind(tx, ty - 1) !== K_RAMP) g.fillStyle(shade(FC[h], 1.3)).fillRect(px, py, T, 3);
    if (w < L && world.kind(tx - 1, ty) !== K_RAMP) { g.fillStyle(0x000000, 0.35).fillRect(px - 8, py + 4, 8, T); g.fillStyle(0x0d0f0b).fillRect(px - 3, py, 3, T); g.fillStyle(shade(FC[h], 1.2)).fillRect(px, py, 2, T); }
    if (e < L && world.kind(tx + 1, ty) !== K_RAMP) { g.fillStyle(0x000000, 0.35).fillRect(px + T, py + 4, 8, T); g.fillStyle(0x0d0f0b).fillRect(px + T, py, 3, T); g.fillStyle(shade(FC[h], 0.75)).fillRect(px + T - 2, py, 2, T); }
  }

  // Стены (псевдо-3D блоки)
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T - ox, py = ty * T - oy;
    if (world.kind(tx, ty) !== K_WALL) continue;
    const below = world.kind(tx, ty + 1) === K_WALL;
    g.fillStyle(0x000000, 0.3).fillRect(px + 4, py + 6, T, T);
    if (!below) g.fillStyle(P.wallFace).fillRect(px, py + T - 14, T, 14);
    g.fillStyle(P.wallTop).fillRect(px, py - 10, T, below ? T + 10 : T - 4);
    g.fillStyle(shade(P.wallTop, 1.15)).fillRect(px + 3, py - 7, T - 6, 5);
    g.lineStyle(1, P.wallLine, 0.9).strokeRect(px + 0.5, py - 9.5, T - 1, below ? T + 9 : T - 5);
    g.lineStyle(1, P.wallLine, 0.8).lineBetween(px + T / 2, py - 2, px + T / 2, py + 12).lineBetween(px + 6, py + 12, px + T - 6, py + 12);
  }
}
