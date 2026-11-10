import type { ZType } from './textures';
import { K_CRATE, K_DOOR, K_ENTRY, K_EXIT, K_FLOOR, K_WALL, type GridMap } from './world';
import type { StageDef } from './stages';

/** Сюжет: главы. Сейчас готова первая; остальные — следующие итерации. */
export interface Chapter { name: string; goal: string; ready: boolean }
export const CHAPTERS: Chapter[] = [
  { name: 'Здание', goal: 'Прорвись к выходу', ready: true },
  { name: 'Город', goal: 'Пересеки город', ready: false },
  { name: 'Мародёрство', goal: 'Найди карту', ready: false },
  { name: 'Деревня', goal: 'Найди транспорт', ready: false },
];

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

export function storyWeights(p: number): [ZType, number][] { return BUILDING_STAGE.weights(p); }
