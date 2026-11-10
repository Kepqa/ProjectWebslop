import type { ZType } from './textures';
import type { GenOpts, Palette } from './world';

export const STAGE_TIME = 600; // 10 минут — уровень пройден

export interface StageDef {
  name: string;
  desc: string;
  bg: string;
  palette: Palette;
  gen: GenOpts;
  hpMul: number; dmgMul: number; rateMul: number;
  bosses: ZType[];
  weights: (t: number) => [ZType, number][];
}

const ramp = (t: number, from: number, max: number, span: number) => (t > from ? Math.min(max, (t - from) / span) : 0);

export const STAGES: StageDef[] = [
  {
    name: 'Окраина',
    desc: 'Заросший пустырь: стены, ящики, холмы с пандусами. Ближе к концу появляются прыгуны.',
    bg: '#151a14',
    palette: { floor: [0x262d23, 0x46553a, 0x6a7d50], ramp: [0x36412f, 0x58694a], wallTop: 0x6a6e78, wallFace: 0x3a3d44, wallLine: 0x50545c, deco: 0x3d4a2c, pit: 0x050605, toxic: 0x5c940d },
    gen: { plateau: 0.62, walls: [1, 3], crates: [2, 6], pits: false, maze: false, toxic: false, graves: [0, 0] },
    hpMul: 1, dmgMul: 1, rateMul: 1,
    bosses: ['colossus', 'brood'],
    weights: (t) => [
      ['walker', 1], ['runner', ramp(t, 25, 0.35, 120)], ['spitter', ramp(t, 45, 0.16, 250)],
      ['charger', ramp(t, 70, 0.13, 300)], ['brute', ramp(t, 55, 0.09, 900)], ['jumper', ramp(t, 240, 0.12, 300)],
    ],
  },
  {
    name: 'Разлом',
    desc: 'Каменистое плато, изрезанное пропастями. Отбрасывай зомби в провал! Прыгуны и подрывники.',
    bg: '#1a1411',
    palette: { floor: [0x3a2e27, 0x5a4638, 0x7d634d], ramp: [0x4a3b31, 0x6b5543], wallTop: 0x7a6a5e, wallFace: 0x483b32, wallLine: 0x5e5046, deco: 0x51402f, pit: 0x040303, toxic: 0x5c940d },
    gen: { plateau: 0.45, walls: [0, 2], crates: [1, 4], pits: true, maze: false, toxic: false, graves: [0, 0] },
    hpMul: 1.3, dmgMul: 1.2, rateMul: 1.1,
    bosses: ['leaper', 'colossus'],
    weights: (t) => [
      ['walker', 1], ['runner', ramp(t, 15, 0.3, 100)], ['jumper', ramp(t, 20, 0.28, 150)],
      ['bomber', ramp(t, 40, 0.15, 200)], ['charger', ramp(t, 60, 0.12, 300)], ['brute', ramp(t, 60, 0.08, 900)],
      ['spitter', ramp(t, 90, 0.1, 300)],
    ],
  },
  {
    name: 'Некрополь',
    desc: 'Склеп из комнат и коридоров. Ядовитые лужи, могилы поднимают мертвецов, призраки ходят сквозь стены.',
    bg: '#12131a',
    palette: { floor: [0x23252e, 0x353a4b, 0x4b5168], ramp: [0x2c2f3c, 0x41465a], wallTop: 0x5b5470, wallFace: 0x2e2a3b, wallLine: 0x433d55, deco: 0x2f3340, pit: 0x030304, toxic: 0x4d7c0f },
    gen: { plateau: 0.25, walls: [0, 1], crates: [0, 2], pits: false, maze: true, toxic: true, graves: [1, 2] },
    hpMul: 1.6, dmgMul: 1.4, rateMul: 1.15,
    bosses: ['necro', 'brood'],
    weights: (t) => [
      ['walker', 1], ['ghost', ramp(t, 20, 0.2, 150)], ['shield', ramp(t, 30, 0.2, 200)],
      ['runner', ramp(t, 20, 0.25, 150)], ['bomber', ramp(t, 60, 0.1, 300)], ['spitter', ramp(t, 60, 0.12, 300)],
      ['jumper', ramp(t, 120, 0.1, 300)], ['brute', ramp(t, 90, 0.08, 900)],
    ],
  },
];

export interface Progress { unlocked: number; best: Record<number, number>; cleared: Record<number, boolean>; story?: number }

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem('ss_progress') || 'null');
    if (p && typeof p.unlocked === 'number') return { unlocked: p.unlocked, best: p.best ?? {}, cleared: p.cleared ?? {}, story: p.story ?? 0 };
  } catch { /* ignore */ }
  return { unlocked: 0, best: {}, cleared: {} };
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem('ss_progress', JSON.stringify(p)); } catch { /* ignore */ }
}
