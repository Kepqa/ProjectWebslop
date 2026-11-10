import Phaser from 'phaser';

export const TILE = 48;
export const CH = 16; // тайлов в чанке
export const CPX = TILE * CH;

export const K_FLOOR = 0, K_WALL = 1, K_CRATE = 2, K_RAMP = 3;

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

/**
 * Бесконечная процедурная карта из чанков.
 * Высоты 0..2: на соседний тайл другой высоты можно попасть только через пандус.
 * Уровень сущности: целый на обычном тайле, h+0.5 на пандусе.
 */
export class World {
  private chunks = new Map<number, Chunk>();
  crateHp = new Map<number, number>();

  constructor(private seed: number) {}

  private chunk(cx: number, cy: number): Chunk {
    const k = key2(cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = this.generate(cx, cy); this.chunks.set(k, c); }
    return c;
  }

  private at(tx: number, ty: number): [Chunk, number] {
    const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH);
    return [this.chunk(cx, cy), (ty - cy * CH) * CH + (tx - cx * CH)];
  }

  kind(tx: number, ty: number) { const [c, i] = this.at(tx, ty); return c.kind[i]; }
  height(tx: number, ty: number) { const [c, i] = this.at(tx, ty); return c.h[i]; }
  setKind(tx: number, ty: number, k: number) { const [c, i] = this.at(tx, ty); c.kind[i] = k; }

  levelOf(tx: number, ty: number) {
    const [c, i] = this.at(tx, ty);
    return c.kind[i] === K_RAMP ? c.h[i] + 0.5 : c.h[i];
  }

  solid(tx: number, ty: number) { const k = this.kind(tx, ty); return k === K_WALL || k === K_CRATE; }

  blocked(tx: number, ty: number, lvl: number) {
    const [c, i] = this.at(tx, ty);
    const k = c.kind[i];
    if (k === K_WALL || k === K_CRATE) return true;
    const tl = k === K_RAMP ? c.h[i] + 0.5 : c.h[i];
    return Math.abs(tl - lvl) > 0.5;
  }

  solidAtPx(x: number, y: number) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }

  /** Выталкивает круг из непроходимых для его уровня тайлов. Возвращает true, если было столкновение. */
  resolve(e: Body, r: number): boolean {
    const rr = Math.min(r, 21);
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const tx0 = Math.floor((e.x - rr) / TILE), tx1 = Math.floor((e.x + rr) / TILE);
      const ty0 = Math.floor((e.y - rr) / TILE), ty1 = Math.floor((e.y + rr) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.blocked(tx, ty, e.lvl)) continue;
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
    if (!this.blocked(tx, ty, e.lvl)) e.lvl = this.levelOf(tx, ty);
  }

  /** Есть ли прямая видимость на одном уровне (без стен и обрывов). */
  clearLine(x1: number, y1: number, x2: number, y2: number, lvl: number) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.ceil(d / 20);
    for (let i = 1; i < n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, y = y1 + ((y2 - y1) * i) / n;
      if (this.blocked(Math.floor(x / TILE), Math.floor(y / TILE), lvl)) return false;
    }
    return true;
  }

  // ---------- Генерация ----------
  private generate(cx: number, cy: number): Chunk {
    const kind = new Uint8Array(CH * CH), h = new Uint8Array(CH * CH), res = new Uint8Array(CH * CH);
    const r = mulberry32(hash(cx, cy, this.seed));
    const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
    const I = (x: number, y: number) => y * CH + x;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < CH && y < CH;

    // Стартовая поляна вокруг (0,0)
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const wx = cx * CH + x + 0.5, wy = cy * CH + y + 0.5;
      if (wx * wx + wy * wy < 64) res[I(x, y)] = 1;
    }
    const rectFree = (x0: number, y0: number, w: number, hh: number) => {
      for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) if (!inside(x, y) || res[I(x, y)]) return false;
      return true;
    };
    const ramp = (x: number, y: number, base: number, ox: number, oy: number) => {
      // ox,oy — направление «наружу» (вниз по склону)
      if (!inside(x, y)) return;
      kind[I(x, y)] = K_RAMP; h[I(x, y)] = base;
      for (const [ax, ay] of [[x, y], [x + ox, y + oy], [x - ox, y - oy]]) if (inside(ax, ay)) res[I(ax, ay)] = 1;
    };
    const placeRamps = (px: number, py: number, pw: number, ph: number, base: number, count: number) => {
      const sides = [0, 1, 2, 3].sort(() => r() - 0.5).slice(0, count);
      for (const side of sides) {
        const horiz = side < 2;
        const len = horiz ? pw : ph;
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
    if (r() < 0.62) {
      const pw = ri(5, 10), ph = ri(5, 10);
      const px = ri(2, CH - 2 - pw), py = ri(2, CH - 2 - ph);
      if (rectFree(px - 1, py - 1, pw + 2, ph + 2)) {
        for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) h[I(x, y)] = 1;
        placeRamps(px, py, pw, ph, 0, ri(1, 3));
        if (pw >= 7 && ph >= 7 && r() < 0.55) {
          const iw = ri(3, pw - 4), ih = ri(3, ph - 4);
          const ix = px + ri(2, pw - iw - 2), iy = py + ri(2, ph - ih - 2);
          for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) h[I(x, y)] = 2;
          placeRamps(ix, iy, iw, ih, 1, 1);
        }
        // кольцо вокруг плато свободно — там всегда есть обход
        for (let y = py - 1; y <= py + ph; y++) for (let x = px - 1; x <= px + pw; x++) {
          if (inside(x, y) && (x === px - 1 || y === py - 1 || x === px + pw || y === py + ph)) res[I(x, y)] = 1;
        }
      }
    }

    // Стены: прямые, Г, П, коридоры
    const walls = ri(1, 3);
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
      for (const [x, y] of tiles) {
        if (x < 1 || y < 1 || x > CH - 2 || y > CH - 2) continue;
        if (res[I(x, y)] || kind[I(x, y)] !== K_FLOOR) continue;
        kind[I(x, y)] = K_WALL;
      }
    }

    // Ящики — одиночные и кучки 2x2, ломаются свайпом
    const crates = ri(2, 6);
    for (let n = 0; n < crates; n++) {
      const x = ri(1, CH - 3), y = ri(1, CH - 3);
      const pile: [number, number][] = r() < 0.35 ? [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] : [[x, y]];
      for (const [px, py] of pile) {
        if (res[I(px, py)] || kind[I(px, py)] !== K_FLOOR) continue;
        kind[I(px, py)] = K_CRATE;
      }
    }
    return { kind, h };
  }
}

/** Поле потока: BFS от игрока по окну вокруг него. Зомби идут по убыванию дистанции. */
export class FlowField {
  readonly N = 96;
  ox = 0; oy = 0;
  private dist = new Int32Array(this.N * this.N);
  private tl = new Float32Array(this.N * this.N);
  private queue = new Int32Array(this.N * this.N);
  static INF = 1 << 30;

  compute(world: World, ptx: number, pty: number) {
    const N = this.N;
    this.ox = ptx - N / 2; this.oy = pty - N / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = this.ox + i, ty = this.oy + j;
      const k = world.kind(tx, ty);
      this.tl[j * N + i] = k === K_WALL || k === K_CRATE ? -99 : world.levelOf(tx, ty);
    }
    this.dist.fill(FlowField.INF);
    const start = (pty - this.oy) * N + (ptx - this.ox);
    this.dist[start] = 0;
    let qh = 0, qt = 0;
    this.queue[qt++] = start;
    while (qh < qt) {
      const cur = this.queue[qh++];
      const cx = cur % N, cy = (cur / N) | 0;
      const d = this.dist[cur] + 1, l = this.tl[cur];
      for (let n = 0; n < 4; n++) {
        const nx = cx + (n === 0 ? 1 : n === 1 ? -1 : 0), ny = cy + (n === 2 ? 1 : n === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        const nl = this.tl[ni];
        if (nl === -99 || Math.abs(nl - l) > 0.5 || this.dist[ni] <= d) continue;
        this.dist[ni] = d;
        this.queue[qt++] = ni;
      }
    }
  }

  distAt(x: number, y: number) {
    const i = Math.floor(x / TILE) - this.ox, j = Math.floor(y / TILE) - this.oy;
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return -1;
    return this.dist[j * this.N + i];
  }

  /** Центр следующего тайла по пути к игроку; null — идти напрямую. */
  next(x: number, y: number): { x: number; y: number } | null {
    const N = this.N;
    const i = Math.floor(x / TILE) - this.ox, j = Math.floor(y / TILE) - this.oy;
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return null;
    const d0 = this.dist[j * N + i];
    if (d0 === FlowField.INF || d0 <= 1) return null;
    let best = d0, bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const v = this.dist[(j + dj) * N + i + di];
      if (v >= best) continue;
      if (di && dj && (this.dist[j * N + i + di] === FlowField.INF || this.dist[(j + dj) * N + i] === FlowField.INF)) continue;
      best = v; bi = i + di; bj = j + dj;
    }
    if (bi < 0) return null;
    return { x: (this.ox + bi + 0.5) * TILE, y: (this.oy + bj + 0.5) * TILE };
  }
}

// ---------- Отрисовка чанка ----------
const FLOOR_COL = [0x262d23, 0x46553a, 0x6a7d50];
const RAMP_COL = [0x36412f, 0x58694a];

function shade(c: number, f: number) {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
}

export function drawChunk(g: Phaser.GameObjects.Graphics, world: World, cx: number, cy: number) {
  const r = mulberry32(hash(cx, cy, 99));
  const T = TILE;
  const lvl = (tx: number, ty: number) => (world.kind(tx, ty) === K_RAMP ? world.height(tx, ty) + 0.5 : world.height(tx, ty));

  // Пол и плато
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T, py = ty * T;
    const k = world.kind(tx, ty), h = world.height(tx, ty);
    if (k === K_RAMP) {
      g.fillStyle(RAMP_COL[Math.min(h, 1)]).fillRect(px, py, T, T);
      // ступени поперёк склона
      const up = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => world.kind(tx + dx, ty + dy) !== K_RAMP && world.height(tx + dx, ty + dy) === h + 1);
      g.fillStyle(0x000000, 0.18);
      for (let s = 0; s < 4; s++) {
        const o = 4 + s * 11;
        if (!up || up[0] === 0) g.fillRect(px, py + o, T, 4); else g.fillRect(px + o, py, 4, T);
      }
      g.fillStyle(0xffffff, 0.06).fillRect(px, py, T, T);
      continue;
    }
    const base = FLOOR_COL[h];
    g.fillStyle(shade(base, 0.94 + r() * 0.12)).fillRect(px, py, T, T);
    for (let n = 0; n < 2; n++) {
      g.fillStyle(r() < 0.5 ? shade(base, 1.18) : shade(base, 0.8), 0.8);
      g.fillRect(px + r() * (T - 6), py + r() * (T - 6), 2 + r() * 5, 2 + r() * 4);
    }
    if (h === 0 && r() < 0.05) {
      g.fillStyle(0x3d4a2c).fillCircle(px + 10 + r() * 28, py + 10 + r() * 28, 3 + r() * 4);
    }
  }

  // Обрывы: южная стенка, кромки, тени у подножия
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T, py = ty * T;
    if (world.kind(tx, ty) === K_RAMP) continue;
    const h = world.height(tx, ty);
    if (h === 0) continue;
    const L = lvl(tx, ty);
    const s = lvl(tx, ty + 1), n = lvl(tx, ty - 1), w = lvl(tx - 1, ty), e = lvl(tx + 1, ty);
    if (s < L && world.kind(tx, ty + 1) !== K_RAMP) {
      const fh = 16 * (L - Math.floor(s));
      g.fillStyle(0x2a2f22).fillRect(px, py + T, T, fh * 0.45);
      g.fillStyle(0x171b12).fillRect(px, py + T + fh * 0.45, T, fh * 0.55);
      g.fillStyle(0x000000, 0.3).fillRect(px, py + T + fh, T, 10);
      g.fillStyle(shade(FLOOR_COL[h], 1.35)).fillRect(px, py + T - 3, T, 3);
    }
    if (n < L && world.kind(tx, ty - 1) !== K_RAMP) g.fillStyle(shade(FLOOR_COL[h], 1.3)).fillRect(px, py, T, 3);
    if (w < L && world.kind(tx - 1, ty) !== K_RAMP) { g.fillStyle(0x000000, 0.35).fillRect(px - 8, py + 4, 8, T); g.fillStyle(0x12160f).fillRect(px - 3, py, 3, T); g.fillStyle(shade(FLOOR_COL[h], 1.2)).fillRect(px, py, 2, T); }
    if (e < L && world.kind(tx + 1, ty) !== K_RAMP) { g.fillStyle(0x000000, 0.35).fillRect(px + T, py + 4, 8, T); g.fillStyle(0x12160f).fillRect(px + T, py, 3, T); g.fillStyle(shade(FLOOR_COL[h], 0.75)).fillRect(px + T - 2, py, 2, T); }
  }

  // Стены (псевдо-3D блоки)
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const tx = cx * CH + x, ty = cy * CH + y, px = tx * T, py = ty * T;
    if (world.kind(tx, ty) !== K_WALL) continue;
    const below = world.kind(tx, ty + 1) === K_WALL;
    g.fillStyle(0x000000, 0.3).fillRect(px + 4, py + 6, T, T);
    if (!below) g.fillStyle(0x3a3d44).fillRect(px, py + T - 14, T, 14);
    g.fillStyle(0x6a6e78).fillRect(px, py - 10, T, below ? T + 10 : T - 4);
    g.fillStyle(0x7d828d).fillRect(px + 3, py - 7, T - 6, 5);
    g.lineStyle(1, 0x50545c, 0.9).strokeRect(px + 0.5, py - 9.5, T - 1, below ? T + 9 : T - 5);
    g.lineStyle(1, 0x585c64, 0.8).lineBetween(px + T / 2, py - 2, px + T / 2, py + 12).lineBetween(px + 6, py + 12, px + T - 6, py + 12);
  }
}
