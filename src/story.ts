import type { ZType } from './textures';
import { K_CRATE, K_DOOR, K_ENTRY, K_EXIT, K_FLOOR, K_PIT, K_WALL, type GridMap } from './world';
import type { StageDef } from './stages';

/** Сюжет: главы. Сейчас готова первая; остальные — следующие итерации. */
/** Внешний вид и враги главы 1 (в формате уровня выживания — для общих систем). */
export const BUILDING_STAGE: StageDef = {
  name: 'Здание',
  desc: '',
  bg: '#0f1012',
  palette: { floor: [0x34373d, 0x45494f, 0x55595f], ramp: [0x3a3d42, 0x4a4d52], wallTop: 0x6b6460, wallFace: 0x3d3835, wallLine: 0x524b47, deco: 0x2c2f33, pit: 0x050505, toxic: 0x4d7c0f },
  gen: { plateau: 0, walls: [0, 0], crates: [0, 0], pits: false, maze: false, toxic: false, graves: [0, 0] },
  hpMul: 1, dmgMul: 1, rateMul: 1,
  bosses: ['colossus'],
  // p — прогресс пути к выходу 0..1: чем ближе к выходу, тем злее и разнообразнее
  weights: (p) => [
    ['walker', 1], ['runner', p > 0.15 ? 0.35 : 0], ['spitter', p > 0.35 ? 0.15 : 0],
    ['charger', p > 0.5 ? 0.12 : 0], ['brute', p > 0.55 ? 0.07 : 0], ['jumper', p > 0.65 ? 0.12 : 0], ['shield', p > 0.75 ? 0.15 : 0],
  ],
};

export interface Pt { x: number; y: number }
export interface StoryMap extends GridMap {
  start: Pt; exit: Pt; entries: Pt[]; groups: { x: number; y: number; n: number; p: number }[]; bossAt: Pt;
  /** Цепочка целей: ключ-карта → генератор (удержание) → выход (удержание со Стражем). */
  objectives: Pt[];
  /** Комнаты с добычей (сундуки) в стороне от пути. */
  loot: Pt[];
}

export interface ObjectiveDef { kind: 'reach' | 'hold'; icon: string; label: string; dur: number }
export const OBJECTIVES: ObjectiveDef[] = [
  { kind: 'reach', icon: '🔑', label: 'Найди ключ-карту', dur: 0 },
  { kind: 'hold', icon: '⚡', label: 'Запусти генератор — стой в круге', dur: 30 },
  { kind: 'hold', icon: '🚪', label: 'Открой выход — держись!', dur: 40 },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Здание 100×100 тайлов: BSP-комнаты, коридоры (часто шириной 1 — в них двери),
 * несколько широких холлов, мебель, лазы для зомби, выход в самой дальней комнате.
 * Детерминировано по seed — хост и гость строят одинаковую карту.
 */
export function genBuilding(seed: number, W = 100, H = 100): StoryMap {
  const r = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const kind = new Uint8Array(W * H).fill(K_WALL);
  const room = new Int16Array(W * H).fill(-1);
  const I = (x: number, y: number) => y * W + x;
  const rooms: Rect[] = [];

  // --- BSP ---
  const leaves: Rect[] = [];
  const split = (rc: Rect, depth: number) => {
    const canH = rc.w >= 22, canV = rc.h >= 22;
    if (depth > 6 || (!canH && !canV) || (depth > 3 && r() < 0.15)) { leaves.push(rc); return; }
    const horiz = canH && (!canV || rc.w > rc.h || (rc.w === rc.h && r() < 0.5));
    if (horiz) {
      const cut = ri(Math.floor(rc.w * 0.35), Math.floor(rc.w * 0.65));
      split({ x: rc.x, y: rc.y, w: cut, h: rc.h }, depth + 1);
      split({ x: rc.x + cut, y: rc.y, w: rc.w - cut, h: rc.h }, depth + 1);
    } else {
      const cut = ri(Math.floor(rc.h * 0.35), Math.floor(rc.h * 0.65));
      split({ x: rc.x, y: rc.y, w: rc.w, h: cut }, depth + 1);
      split({ x: rc.x, y: rc.y + cut, w: rc.w, h: rc.h - cut }, depth + 1);
    }
  };
  split({ x: 1, y: 1, w: W - 2, h: H - 2 }, 0);

  for (const lf of leaves) {
    const w = ri(Math.max(5, Math.floor(lf.w * 0.5)), Math.max(5, lf.w - 3));
    const h = ri(Math.max(5, Math.floor(lf.h * 0.5)), Math.max(5, lf.h - 3));
    const x = lf.x + ri(1, Math.max(1, lf.w - w - 1)), y = lf.y + ri(1, Math.max(1, lf.h - h - 1));
    const rc = { x, y, w: Math.min(w, W - 2 - x), h: Math.min(h, H - 2 - y) };
    const id = rooms.length;
    rooms.push(rc);
    for (let yy = rc.y; yy < rc.y + rc.h; yy++) for (let xx = rc.x; xx < rc.x + rc.w; xx++) { kind[I(xx, yy)] = K_FLOOR; room[I(xx, yy)] = id; }
  }

  const center = (rc: Rect) => ({ x: rc.x + (rc.w >> 1), y: rc.y + (rc.h >> 1) });
  const carve = (x: number, y: number, wide: number) => {
    for (let o = 0; o < wide; o++) {
      const xx = x, yy = y + o;
      if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1 && kind[I(xx, yy)] === K_WALL) kind[I(xx, yy)] = K_FLOOR;
    }
  };
  const corridor = (a: Pt, b: Pt, wide: number) => {
    let { x, y } = a;
    const hFirst = r() < 0.5;
    const stepX = () => { while (x !== b.x) { carve(x, y, wide); x += Math.sign(b.x - x); } };
    const stepY = () => { while (y !== b.y) { for (let o = 0; o < wide; o++) carveV(x + o, y); y += Math.sign(b.y - y); } };
    const carveV = (xx: number, yy: number) => { if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 1 && kind[I(xx, yy)] === K_WALL) kind[I(xx, yy)] = K_FLOOR; };
    if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    carve(x, y, wide);
  };
  // соединяем комнаты по цепочке (близкие по порядку BSP — соседи) + несколько лишних петель
  const order = rooms.map((_, i) => i);
  for (let i = 1; i < order.length; i++) corridor(center(rooms[order[i - 1]]), center(rooms[order[i]]), r() < 0.2 ? 2 : 1);
  for (let k = 0; k < Math.floor(rooms.length / 4); k++) {
    const a = ri(0, rooms.length - 1), b = ri(0, rooms.length - 1);
    if (a !== b) corridor(center(rooms[a]), center(rooms[b]), 1);
  }

  // --- двери: проход шириной 1 у края комнаты ---
  const isF = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && kind[I(x, y)] !== K_WALL;
  const doorNear = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && kind[I(x + dx, y + dy)] === K_DOOR) return true;
    return false;
  };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (kind[I(x, y)] !== K_FLOOR || room[I(x, y)] >= 0) continue;
    const ns = isF(x, y - 1) && isF(x, y + 1) && !isF(x - 1, y) && !isF(x + 1, y);
    const ew = isF(x - 1, y) && isF(x + 1, y) && !isF(x, y - 1) && !isF(x, y + 1);
    if (!ns && !ew) continue;
    const touchesRoom = ns ? room[I(x, y - 1)] >= 0 || room[I(x, y + 1)] >= 0 : room[I(x - 1, y)] >= 0 || room[I(x + 1, y)] >= 0;
    if (touchesRoom && !doorNear(x, y) && r() < 0.75) kind[I(x, y)] = K_DOOR;
  }

  // --- старт и выход: самая дальняя комната по BFS ---
  const startRoom = rooms.reduce((best, rc, i) => (rc.x + rc.y < rooms[best].x + rooms[best].y ? i : best), 0);
  const start = center(rooms[startRoom]);
  const dist = new Int32Array(W * H).fill(-1);
  const q = [I(start.x, start.y)]; dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!isF(nx, ny) || dist[I(nx, ny)] >= 0) continue;
      dist[I(nx, ny)] = dist[c] + 1; q.push(I(nx, ny));
    }
  }
  let exitRoom = startRoom, far = -1;
  rooms.forEach((rc, i) => { const d = dist[I(center(rc).x, center(rc).y)]; if (d > far) { far = d; exitRoom = i; } });
  const exit = center(rooms[exitRoom]);
  kind[I(exit.x, exit.y)] = K_EXIT;
  const maxD = Math.max(1, far);

  // --- цели по пути: ~40% и ~70% дистанции до выхода ---
  const pickRoomAt = (frac: number) => {
    let best = startRoom, bd = 1e9;
    rooms.forEach((rc, i) => {
      if (i === startRoom || i === exitRoom) return;
      const c = center(rc), d = dist[I(c.x, c.y)];
      if (d < 0) return;
      const diff = Math.abs(d / maxD - frac);
      if (diff < bd) { bd = diff; best = i; }
    });
    return best;
  };
  const objRooms = [pickRoomAt(0.4), pickRoomAt(0.7), exitRoom];
  const objectives = objRooms.map((i) => center(rooms[i]));
  for (const o of objectives) {
    // площадка цели без мебели
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = o.x + dx, y = o.y + dy;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && kind[I(x, y)] === K_CRATE) kind[I(x, y)] = K_FLOOR;
    }
  }
  const loot: Pt[] = [];

  // --- мебель, лазы, спящие группы ---
  const entries: Pt[] = [];
  const groups: StoryMap['groups'] = [];
  rooms.forEach((rc, i) => {
    if (i === startRoom) return;
    const c = center(rc);
    const p = Math.min(1, Math.max(0, dist[I(c.x, c.y)] / maxD));
    // мебель (ящики) вдоль стен и колонны в больших залах
    for (let n = ri(0, 3); n > 0; n--) {
      const side = ri(0, 3);
      const x = side < 2 ? ri(rc.x, rc.x + rc.w - 1) : side === 2 ? rc.x : rc.x + rc.w - 1;
      const y = side >= 2 ? ri(rc.y, rc.y + rc.h - 1) : side === 0 ? rc.y : rc.y + rc.h - 1;
      if (kind[I(x, y)] === K_FLOOR && !(x === exit.x && y === exit.y)) kind[I(x, y)] = K_CRATE;
    }
    if (rc.w >= 10 && rc.h >= 10) {
      for (const [fx, fy] of [[0.33, 0.33], [0.66, 0.33], [0.33, 0.66], [0.66, 0.66]]) {
        const x = rc.x + Math.floor(rc.w * fx), y = rc.y + Math.floor(rc.h * fy);
        if (kind[I(x, y)] === K_FLOOR) kind[I(x, y)] = K_WALL;
      }
    }
    // лаз у стены — примерно в каждой второй комнате
    if (i !== exitRoom && r() < 0.55) {
      const x = rc.x + ri(0, rc.w - 1), y = r() < 0.5 ? rc.y : rc.y + rc.h - 1;
      if (kind[I(x, y)] === K_FLOOR) { kind[I(x, y)] = K_ENTRY; entries.push({ x, y }); }
    }
    // засады (спящие группы) — реже, чем раньше: основное давление — орда
    if (i !== exitRoom && !objRooms.includes(i) && r() < 0.35) groups.push({ x: c.x, y: c.y, n: 2 + Math.round(p * 4) + ri(0, 2), p });
    // сундук в части комнат
    if (!objRooms.includes(i) && r() < 0.3) loot.push({ x: c.x + ri(-1, 1), y: c.y + ri(-1, 1) });
  });
  for (const lp of loot) if (kind[I(lp.x, lp.y)] !== K_FLOOR) kind[I(lp.x, lp.y)] = K_FLOOR;

  return { W, H, kind, start, exit, entries, groups, bossAt: exit, objectives, loot };
}


// ======================= Общие помощники генераторов =======================
/** BFS-дистанции от точки по проходимым клеткам. */
function bfs(kind: Uint8Array, W: number, H: number, sx: number, sy: number) {
  const dist = new Int32Array(W * H).fill(-1);
  const pass = (k: number) => k !== K_WALL && k !== K_CRATE && k !== K_PIT;
  const q = [sy * W + sx]; dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] >= 0 || !pass(kind[n])) continue;
      dist[n] = dist[c] + 1; q.push(n);
    }
  }
  return dist;
}

/** Точка (клетка) с относительной дистанцией ближе всего к frac среди кандидатов. */
function pickAt(cands: Pt[], dist: Int32Array, W: number, maxD: number, frac: number, avoid: Pt[] = []) {
  let best = cands[0], bd = 1e9;
  for (const c of cands) {
    const d = dist[c.y * W + c.x];
    if (d < 0 || avoid.some((a) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) < 12)) continue;
    const diff = Math.abs(d / maxD - frac);
    if (diff < bd) { bd = diff; best = c; }
  }
  return best;
}

function clearAround(kind: Uint8Array, W: number, H: number, p: Pt, r: number) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && kind[y * W + x] !== K_DOOR) kind[y * W + x] = K_FLOOR;
  }
}

/**
 * Город: кварталы со зданиями, улицы с машинами и баррикадами, спящие группы на перекрёстках.
 * enterable — у части зданий есть внутренние помещения с дверями (глава 3).
 */
export function genCity(seed: number, enterable: boolean, W = 110, H = 110): StoryMap {
  const r = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const kind = new Uint8Array(W * H).fill(K_FLOOR);
  const I = (x: number, y: number) => y * W + x;
  for (let x = 0; x < W; x++) { kind[I(x, 0)] = K_WALL; kind[I(x, H - 1)] = K_WALL; }
  for (let y = 0; y < H; y++) { kind[I(0, y)] = K_WALL; kind[I(W - 1, y)] = K_WALL; }
  const street = 4;
  const xs: number[] = [], ys: number[] = [];
  for (let x = 3; x < W - 8; x += ri(10, 15) + street) xs.push(x);
  for (let y = 3; y < H - 8; y += ri(10, 15) + street) ys.push(y);
  const buildings: { x: number; y: number; w: number; h: number; door: Pt | null }[] = [];
  const parks: Pt[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
    const bx = xs[i] + street, by = ys[j] + street;
    const bw = Math.min((xs[i + 1] ?? W - 2) - bx, W - 2 - bx), bh = Math.min((ys[j + 1] ?? H - 2) - by, H - 2 - by);
    if (bw < 6 || bh < 6) continue;
    const kindRoll = r();
    if (kindRoll < 0.15) { // сквер с деревьями
      for (let n = ri(4, 9); n > 0; n--) { const x = bx + ri(1, bw - 2), y = by + ri(1, bh - 2); kind[I(x, y)] = K_WALL; }
      parks.push({ x: bx + (bw >> 1), y: by + (bh >> 1) });
      continue;
    }
    if (kindRoll < 0.27) { // парковка с машинами
      for (let n = ri(2, 5); n > 0; n--) { const x = bx + ri(1, bw - 3), y = by + ri(1, bh - 2); kind[I(x, y)] = K_CRATE; kind[I(x + 1, y)] = K_CRATE; }
      continue;
    }
    // здание: отступ-тротуар 1 клетка
    const x0 = bx + 1, y0 = by + 1, w = bw - 2, h = bh - 2;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) kind[I(x, y)] = K_WALL;
    let door: Pt | null = null;
    if (enterable && w >= 6 && h >= 6 && r() < 0.6) {
      for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) kind[I(x, y)] = K_FLOOR;
      // перегородка с проходом
      if (w >= 9) { const px = x0 + (w >> 1), gap = ri(y0 + 1, y0 + h - 3); for (let y = y0 + 1; y < y0 + h - 1; y++) if (y !== gap && y !== gap + 1) kind[I(px, y)] = K_WALL; }
      // двери на фасадах
      const side = ri(0, 3);
      door = side === 0 ? { x: x0 + ri(1, w - 2), y: y0 } : side === 1 ? { x: x0 + ri(1, w - 2), y: y0 + h - 1 } : side === 2 ? { x: x0, y: y0 + ri(1, h - 2) } : { x: x0 + w - 1, y: y0 + ri(1, h - 2) };
      kind[I(door.x, door.y)] = K_DOOR;
      const d2 = side < 2 ? { x: x0 + ri(1, w - 2), y: side === 0 ? y0 + h - 1 : y0 } : { x: side === 2 ? x0 + w - 1 : x0, y: y0 + ri(1, h - 2) };
      if (r() < 0.5) kind[I(d2.x, d2.y)] = K_DOOR;
      for (let n = ri(1, 3); n > 0; n--) { const x = x0 + ri(1, w - 2), y = y0 + ri(1, h - 2); if (kind[I(x, y)] === K_FLOOR) kind[I(x, y)] = K_CRATE; }
    }
    buildings.push({ x: x0, y: y0, w, h, door });
  }
  // машины и баррикады на улицах
  const streetCells: Pt[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (kind[I(x, y)] === K_FLOOR) streetCells.push({ x, y });
  for (let n = 0; n < 60; n++) {
    const c = streetCells[ri(0, streetCells.length - 1)];
    if (r() < 0.75) { if (kind[I(c.x + 1, c.y)] === K_FLOOR) { kind[I(c.x, c.y)] = K_CRATE; kind[I(c.x + 1, c.y)] = K_CRATE; } }
    else { const horiz = r() < 0.5; for (let k = 0; k < ri(2, 4); k++) { const x = c.x + (horiz ? k : 0), y = c.y + (horiz ? 0 : k); if (x < W - 1 && y < H - 1 && kind[I(x, y)] === K_FLOOR) kind[I(x, y)] = K_WALL; } }
  }
  const start = { x: 3, y: H - 4 };
  clearAround(kind, W, H, start, 3);
  const dist = bfs(kind, W, H, start.x, start.y);
  let maxD = 1;
  for (const d of dist) if (d > maxD) maxD = d;
  const open = streetCells.filter((c) => kind[I(c.x, c.y)] === K_FLOOR && dist[I(c.x, c.y)] > 0);
  let objectives: Pt[];
  if (enterable) {
    // 3 обыска внутри зданий с дверями + удержание двора в конце
    const inside = buildings.filter((b) => b.door).map((b) => ({ x: b.x + (b.w >> 1) - (b.w >= 9 ? 2 : 0), y: b.y + (b.h >> 1) }));
    const reach = inside.filter((p) => dist[I(p.x, p.y)] > 0);
    const o1 = pickAt(reach, dist, W, maxD, 0.25), o2 = pickAt(reach, dist, W, maxD, 0.5, [o1]), o3 = pickAt(reach, dist, W, maxD, 0.75, [o1, o2]);
    const o4 = pickAt(open, dist, W, maxD, 1);
    objectives = [o1, o2, o3, o4];
  } else {
    objectives = [pickAt(open, dist, W, maxD, 0.4), pickAt(open, dist, W, maxD, 0.7), pickAt(open, dist, W, maxD, 1)];
  }
  for (const o of objectives) clearAround(kind, W, H, o, 2);
  const groups: StoryMap['groups'] = [];
  for (let n = 0; n < 20; n++) {
    const c = open[ri(0, open.length - 1)];
    const d = dist[I(c.x, c.y)];
    if (d < 12) continue;
    const p = Math.min(1, d / maxD);
    groups.push({ x: c.x, y: c.y, n: 2 + Math.round(p * 3) + ri(0, 2), p });
  }
  const loot: Pt[] = [];
  for (const b of buildings) if (b.door && !objectives.some((o) => o.x >= b.x && o.x < b.x + b.w && o.y >= b.y && o.y < b.y + b.h) && r() < 0.5) loot.push({ x: b.x + 1 + ri(0, Math.max(0, b.w - 3)), y: b.y + 1 + ri(0, Math.max(0, b.h - 3)) });
  for (const p of parks) if (r() < 0.4) loot.push(p);
  for (const l of loot) kind[I(l.x, l.y)] = K_FLOOR;
  const exit = objectives[objectives.length - 1];
  return { W, H, kind, start, exit, entries: [], groups, bossAt: exit, objectives, loot };
}

/** Деревня: поле, рощи, пруды, фермы за заборами (сарай, дом), стаи собак. */
export function genVillage(seed: number, W = 120, H = 120): StoryMap {
  const r = rng(seed);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const kind = new Uint8Array(W * H).fill(K_FLOOR);
  const I = (x: number, y: number) => y * W + x;
  const inb = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  for (let x = 0; x < W; x++) { kind[I(x, 0)] = K_WALL; kind[I(x, H - 1)] = K_WALL; }
  for (let y = 0; y < H; y++) { kind[I(0, y)] = K_WALL; kind[I(W - 1, y)] = K_WALL; }
  // рощи
  for (let n = 0; n < 22; n++) {
    const cx = ri(5, W - 6), cy = ri(5, H - 6), rad = 1.5 + r() * 3;
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) if (inb(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && r() < 0.55) kind[I(x, y)] = K_WALL;
  }
  // пруды (пропасти — туда можно скинуть зомби)
  for (let n = 0; n < 6; n++) {
    const cx = ri(10, W - 11), cy = ri(10, H - 11), rad = 1.8 + r() * 2.2;
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) if (inb(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) kind[I(x, y)] = K_PIT;
  }
  // фермы
  const farms: Pt[] = [];
  for (let tries = 0; farms.length < 6 && tries < 80; tries++) {
    const w = ri(12, 16), h = ri(10, 14), x0 = ri(4, W - w - 4), y0 = ri(4, H - h - 4);
    if (farms.some((f) => Math.abs(f.x - (x0 + w / 2)) < 20 && Math.abs(f.y - (y0 + h / 2)) < 18)) continue;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (inb(x, y)) kind[I(x, y)] = K_FLOOR;
    // забор с воротами
    for (let x = x0; x < x0 + w; x++) { kind[I(x, y0)] = K_WALL; kind[I(x, y0 + h - 1)] = K_WALL; }
    for (let y = y0; y < y0 + h; y++) { kind[I(x0, y)] = K_WALL; kind[I(x0 + w - 1, y)] = K_WALL; }
    const gate = (gx: number, gy: number, horiz: boolean) => { for (let k = 0; k < 3; k++) kind[I(gx + (horiz ? k : 0), gy + (horiz ? 0 : k))] = K_FLOOR; };
    gate(x0 + ri(2, w - 5), y0, true); gate(x0 + ri(2, w - 5), y0 + h - 1, true);
    if (r() < 0.6) gate(x0, y0 + ri(2, h - 5), false);
    // дом (глухой) и сарай с дверью
    const hx = x0 + 2, hy = y0 + 2;
    for (let y = hy; y < hy + 3; y++) for (let x = hx; x < hx + 4; x++) kind[I(x, y)] = K_WALL;
    const bx = x0 + w - 7, by = y0 + h - 6;
    for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 5; x++) kind[I(x, y)] = (y === by || y === by + 3 || x === bx || x === bx + 4) ? K_WALL : K_FLOOR;
    kind[I(bx + 2, by)] = K_DOOR;
    // сено (ящики)
    for (let n = ri(1, 3); n > 0; n--) { const x = x0 + ri(2, w - 3), y = y0 + ri(5, h - 3); if (kind[I(x, y)] === K_FLOOR) kind[I(x, y)] = K_CRATE; }
    farms.push({ x: x0 + (w >> 1), y: y0 + (h >> 1) + 1 });
  }
  const start = { x: 4, y: 4 };
  clearAround(kind, W, H, start, 3);
  for (const f of farms) clearAround(kind, W, H, f, 2);
  const dist = bfs(kind, W, H, start.x, start.y);
  const reachable = farms.filter((f) => dist[I(f.x, f.y)] > 0).sort((a, b) => dist[I(a.x, a.y)] - dist[I(b.x, b.y)]);
  // три фермы с машинами: ближняя, средняя, дальняя
  const objectives = reachable.length >= 3 ? [reachable[Math.floor(reachable.length * 0.3)], reachable[Math.floor(reachable.length * 0.65)], reachable[reachable.length - 1]] : [farms[0], farms[1] ?? farms[0], farms[2] ?? farms[0]];
  let maxD = 1;
  for (const d of dist) if (d > maxD) maxD = d;
  const open: Pt[] = [];
  for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) if (dist[I(x, y)] > 12) open.push({ x, y });
  const groups: StoryMap['groups'] = [];
  for (let n = 0; n < 18 && open.length; n++) {
    const c = open[ri(0, open.length - 1)], p = Math.min(1, dist[I(c.x, c.y)] / maxD);
    groups.push({ x: c.x, y: c.y, n: 2 + Math.round(p * 3) + ri(0, 1), p });
  }
  const loot = farms.filter((f) => !objectives.includes(f)).map((f) => ({ x: f.x, y: f.y }));
  const exit = objectives[2];
  return { W, H, kind, start, exit, entries: [], groups, bossAt: exit, objectives, loot };
}

// ======================= Главы =======================
const CITY_PAL = { floor: [0x2c2e31, 0x3a3d41, 0x45484c], ramp: [0x34373b, 0x404347], wallTop: 0x7a5546, wallFace: 0x4a3229, wallLine: 0x5e4035, deco: 0x3a3a3a, pit: 0x050505, toxic: 0x4d7c0f };
const VILLAGE_PAL = { floor: [0x2e4423, 0x3a5a2e, 0x4a6b38], ramp: [0x3b5a2e, 0x4a6b38], wallTop: 0x4e6b2e, wallFace: 0x2c3d18, wallLine: 0x3d5422, deco: 0x5a7a3a, pit: 0x13314a, toxic: 0x4d7c0f };
const NOGEN = { plateau: 0, walls: [0, 0] as [number, number], crates: [0, 0] as [number, number], pits: false, maze: false, toxic: false, graves: [0, 0] as [number, number] };

export const CITY_STAGE: StageDef = {
  name: 'Город', desc: '', bg: '#101113', palette: CITY_PAL, gen: NOGEN, hpMul: 1.05, dmgMul: 1, rateMul: 1, bosses: ['brood'],
  weights: (p) => [['walker', 1], ['runner', p > 0.1 ? 0.3 : 0], ['spitter', p > 0.3 ? 0.15 : 0], ['bomber', p > 0.4 ? 0.1 : 0], ['charger', p > 0.45 ? 0.12 : 0], ['brute', p > 0.5 ? 0.07 : 0], ['jumper', p > 0.6 ? 0.1 : 0]],
};
export const LOOT_STAGE: StageDef = {
  ...CITY_STAGE, name: 'Мародёрство', palette: { ...CITY_PAL, wallTop: 0x6b5a4f, wallFace: 0x3d332c }, hpMul: 1.15, dmgMul: 1.08, bosses: ['necro'],
  weights: (p) => [['walker', 1], ['runner', 0.25], ['shield', p > 0.2 ? 0.15 : 0], ['spitter', p > 0.3 ? 0.15 : 0], ['bomber', p > 0.4 ? 0.1 : 0], ['charger', p > 0.5 ? 0.12 : 0], ['brute', p > 0.55 ? 0.08 : 0], ['ghost', p > 0.6 ? 0.1 : 0]],
};
export const VILLAGE_STAGE: StageDef = {
  name: 'Деревня', desc: '', bg: '#0e1a0c', palette: VILLAGE_PAL, gen: NOGEN, hpMul: 1.25, dmgMul: 1.15, rateMul: 1, bosses: ['leaper'],
  weights: (p) => [['walker', 0.7], ['dog', 0.5], ['boar', p > 0.15 ? 0.18 : 0], ['runner', 0.2], ['jumper', p > 0.45 ? 0.1 : 0], ['brute', p > 0.5 ? 0.06 : 0]],
};

export interface Chapter {
  name: string; goal: string; ready: boolean; stage: StageDef; gen: (seed: number) => StoryMap; objectives: ObjectiveDef[];
  /** На каком расстоянии (клетки) спящие замечают героя даже без шума. */
  sight: number;
}

export const CHAPTERS: Chapter[] = [
  { name: 'Здание', goal: 'Прорвись к выходу', ready: true, stage: BUILDING_STAGE, gen: (s) => genBuilding(s), objectives: OBJECTIVES, sight: 0 },
  {
    name: 'Город', goal: 'Пересеки город до эвакуации', ready: true, stage: CITY_STAGE, gen: (s) => genCity(s, false), sight: 9,
    objectives: [
      { kind: 'reach', icon: '🚧', label: 'Пробейся к перекрёстку', dur: 0 },
      { kind: 'hold', icon: '📻', label: 'Поймай сигнал на радиовышке', dur: 30 },
      { kind: 'hold', icon: '🚁', label: 'Продержись до эвакуации', dur: 45 },
    ],
  },
  {
    name: 'Мародёрство', goal: 'Обыщи дома и найди карту', ready: true, stage: LOOT_STAGE, gen: (s) => genCity(s, true), sight: 9,
    objectives: [
      { kind: 'reach', icon: '💊', label: 'Обыщи аптеку', dur: 0 },
      { kind: 'reach', icon: '🛒', label: 'Обыщи магазин', dur: 0 },
      { kind: 'reach', icon: '🗺️', label: 'Найди карту в офисе', dur: 0 },
      { kind: 'hold', icon: '🏃', label: 'Уходи — держи двор', dur: 35 },
    ],
  },
  {
    name: 'Деревня', goal: 'Найди рабочую машину', ready: true, stage: VILLAGE_STAGE, gen: (s) => genVillage(s), sight: 10,
    objectives: [
      { kind: 'hold', icon: '🚜', label: 'Осмотри трактор', dur: 15 },
      { kind: 'hold', icon: '🛻', label: 'Осмотри грузовик', dur: 20 },
      { kind: 'hold', icon: '🚙', label: 'Почини пикап — держись!', dur: 40 },
    ],
  },
];
