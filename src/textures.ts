import Phaser from 'phaser';

/** Текстуры рисуются в S раз крупнее и уменьшаются при отрисовке — чётко на retina. */
export const S = 2;

export type ZType = 'walker' | 'runner' | 'spitter' | 'charger' | 'brute' | 'colossus' | 'brood';

export interface ZLook { r: number; color: number; dark: number; eye: number }

export const ZLOOK: Record<ZType, ZLook> = {
  walker: { r: 14, color: 0x74a84a, dark: 0x3d5e25, eye: 0xffe066 },
  runner: { r: 11, color: 0xb5c24f, dark: 0x5c6620, eye: 0xff6b6b },
  spitter: { r: 14, color: 0x5fbf8f, dark: 0x22604a, eye: 0xd8f5a2 },
  charger: { r: 18, color: 0x9a6b4f, dark: 0x4a2f20, eye: 0xff8787 },
  brute: { r: 26, color: 0x4f7a5a, dark: 0x22392a, eye: 0xffd43b },
  colossus: { r: 48, color: 0x6d7f4a, dark: 0x2f3a1d, eye: 0xff6b6b },
  brood: { r: 44, color: 0x8e5a7a, dark: 0x40213a, eye: 0xffec99 },
};

/** Точка вращения зомби (центр тела) в долях текстуры. */
export function zOrigin(t: ZType) {
  const r = ZLOOK[t].r;
  const W = Math.ceil(r * 3.3);
  return (r * 1.25) / W;
}

export function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('dot')) return;
  const g = scene.make.graphics({}, false);
  const gen = (key: string, w: number, h: number) => { g.generateTexture(key, Math.ceil(w * S), Math.ceil(h * S)); g.clear(); };
  const s = S;

  g.fillStyle(0xffffff).fillCircle(4 * s, 4 * s, 4 * s);
  gen('dot', 8, 8);
  g.fillStyle(0xffffff).fillRect(0, 0, 6 * s, 3 * s);
  gen('chip', 6, 3);

  // Игрок: плащ, капюшон, клинок в руке
  g.fillStyle(0x000000, 0.3).fillCircle(22 * s, 23 * s, 17 * s);
  g.fillStyle(0x1c7ed6).fillCircle(22 * s, 22 * s, 15 * s);
  g.fillStyle(0x4dabf7).fillCircle(23 * s, 22 * s, 11 * s);
  g.lineStyle(2.5 * s, 0xffffff).strokeCircle(22 * s, 22 * s, 15 * s);
  g.fillStyle(0xe7f5ff).fillRect(33 * s, 13 * s, 10 * s, 3 * s);
  g.fillStyle(0xffffff).fillTriangle(42 * s, 11 * s, 42 * s, 18 * s, 46 * s, 14.5 * s);
  g.fillStyle(0xd0ebff).fillCircle(29 * s, 18 * s, 2 * s).fillCircle(29 * s, 26 * s, 2 * s);
  gen('player', 46, 44);

  for (const t of Object.keys(ZLOOK) as ZType[]) drawZombie(g, t, gen);

  const gem = [{ x: 6 * s, y: 0 }, { x: 12 * s, y: 8 * s }, { x: 6 * s, y: 16 * s }, { x: 0, y: 8 * s }];
  g.fillStyle(0x66d9e8).fillPoints(gem, true);
  g.fillStyle(0xc5f6fa).fillTriangle(6 * s, 1 * s, 10 * s, 7 * s, 6 * s, 8 * s);
  g.lineStyle(1.5 * s, 0xffffff, 0.8).strokePoints(gem, true);
  gen('gem', 12, 16);

  g.fillStyle(0x000000, 0.3).fillEllipse(14 * s, 25 * s, 28 * s, 8 * s);
  g.fillStyle(0xb5762b).fillRect(1 * s, 6 * s, 26 * s, 18 * s);
  g.fillStyle(0x8a5320).fillRect(1 * s, 6 * s, 26 * s, 5 * s);
  g.fillStyle(0xffd43b).fillRect(1 * s, 11 * s, 26 * s, 3 * s).fillRect(12 * s, 6 * s, 4 * s, 18 * s);
  g.lineStyle(2 * s, 0x000000).strokeRect(1 * s, 6 * s, 26 * s, 18 * s);
  gen('chest', 28, 28);

  g.fillStyle(0xf1f3f5).fillCircle(4 * s, 5 * s, 4 * s).fillCircle(4 * s, 13 * s, 4 * s)
    .fillCircle(20 * s, 5 * s, 4 * s).fillCircle(20 * s, 13 * s, 4 * s).fillRect(4 * s, 6 * s, 16 * s, 6 * s);
  gen('bone', 24, 18);

  g.fillStyle(0x5c1a22, 0.75).fillCircle(16 * s, 16 * s, 11 * s).fillCircle(8 * s, 20 * s, 6 * s)
    .fillCircle(24 * s, 10 * s, 5 * s).fillCircle(26 * s, 22 * s, 3 * s).fillCircle(5 * s, 9 * s, 2 * s);
  gen('splat', 32, 32);

  g.fillStyle(0x94d82d, 0.35).fillCircle(9 * s, 9 * s, 9 * s);
  g.fillStyle(0xc0eb75).fillCircle(9 * s, 9 * s, 5.5 * s);
  g.fillStyle(0xffffff, 0.8).fillCircle(7 * s, 7 * s, 2 * s);
  gen('acid', 18, 18);

  // Ящик (размер тайла 48)
  g.fillStyle(0x000000, 0.35).fillRect(4 * s, 8 * s, 44 * s, 42 * s);
  g.fillStyle(0x9c6b3a).fillRect(3 * s, 3 * s, 42 * s, 42 * s);
  g.fillStyle(0x7a4f28).fillRect(3 * s, 3 * s, 42 * s, 6 * s).fillRect(3 * s, 39 * s, 42 * s, 6 * s)
    .fillRect(3 * s, 3 * s, 6 * s, 42 * s).fillRect(39 * s, 3 * s, 6 * s, 42 * s);
  g.lineStyle(5 * s, 0x7a4f28).lineBetween(8 * s, 8 * s, 40 * s, 40 * s);
  g.lineStyle(2 * s, 0x3b2412).strokeRect(3 * s, 3 * s, 42 * s, 42 * s);
  gen('crate', 50, 50);

  g.destroy();
}

function drawZombie(g: Phaser.GameObjects.Graphics, t: ZType, gen: (k: string, w: number, h: number) => void) {
  const s = S;
  const { r, color, dark, eye } = ZLOOK[t];
  const W = Math.ceil(r * 3.3), H = Math.ceil(r * 2.6);
  const cx = r * 1.25 * s, cy = (H / 2) * s, R = r * s;

  g.fillStyle(0x000000, 0.28).fillCircle(cx + 2 * s, cy + 3 * s, R * 1.08);
  // Руки, тянущиеся вперёд
  const armLen = t === 'charger' ? 1.2 : t === 'spitter' ? 0.9 : 1.9;
  g.fillStyle(dark);
  g.fillRect(cx, cy - R * 0.82, R * armLen, R * 0.3);
  g.fillRect(cx, cy + R * 0.52, R * armLen * 0.92, R * 0.3);
  g.fillStyle(color).fillCircle(cx + R * armLen, cy - R * 0.67, R * 0.2).fillCircle(cx + R * armLen * 0.92, cy + R * 0.67, R * 0.2);
  // Тело
  g.fillStyle(color).fillCircle(cx, cy, R);
  g.fillStyle(dark, 0.35).fillCircle(cx - R * 0.25, cy + R * 0.15, R * 0.7);
  g.fillStyle(0xffffff, 0.12).fillCircle(cx + R * 0.2, cy - R * 0.3, R * 0.45);
  g.lineStyle(Math.max(2, r * 0.12) * s, dark).strokeCircle(cx, cy, R);

  if (t === 'charger') {
    g.fillStyle(0xe9ecef).fillTriangle(cx + R * 0.6, cy - R * 0.7, cx + R * 1.3, cy - R * 0.95, cx + R * 0.8, cy - R * 0.3);
    g.fillTriangle(cx + R * 0.6, cy + R * 0.7, cx + R * 1.3, cy + R * 0.95, cx + R * 0.8, cy + R * 0.3);
  }
  if (t === 'spitter') {
    g.fillStyle(0xa9e34b, 0.9).fillCircle(cx - R * 0.35, cy - R * 0.45, R * 0.3).fillCircle(cx - R * 0.45, cy + R * 0.35, R * 0.25);
    g.fillStyle(0x1b3d2f).fillCircle(cx + R * 0.75, cy, R * 0.22);
  }
  if (t === 'colossus' || t === 'brute') {
    g.lineStyle(2 * s, 0x2b1d1d, 0.8);
    for (let i = -2; i <= 2; i++) g.lineBetween(cx - R * 0.5 + i * R * 0.12, cy - R * 0.55, cx - R * 0.4 + i * R * 0.12, cy - R * 0.4);
    g.lineBetween(cx - R * 0.6, cy - R * 0.47, cx - R * 0.05, cy - R * 0.47);
  }
  if (t === 'brood') {
    g.fillStyle(0xf3d9fa, 0.85);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8;
      g.fillCircle(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.16);
    }
  }
  g.fillStyle(eye);
  const er = Math.max(2, r * 0.15) * s;
  g.fillCircle(cx + R * 0.48, cy - R * 0.32, er).fillCircle(cx + R * 0.48, cy + R * 0.32, er);
  g.fillStyle(0x000000).fillCircle(cx + R * 0.55, cy - R * 0.32, er * 0.45).fillCircle(cx + R * 0.55, cy + R * 0.32, er * 0.45);
  gen(t, W, H);

  // Половинка для разреза
  g.fillStyle(color).slice((r + 2) * s, (r + 2) * s, R, 0, Math.PI, false).fillPath();
  g.fillStyle(dark, 0.4).slice((r + 2) * s, (r + 2) * s, R * 0.7, 0, Math.PI, false).fillPath();
  g.fillStyle(0x8c2f39).fillRect(2 * s, (r + 1) * s, r * 2 * s, 3 * s);
  g.fillStyle(0xc92a2a).fillRect(4 * s, (r + 1.5) * s, (r * 2 - 4) * s, 1.5 * s);
  gen(`${t}_half`, r * 2 + 4, r * 2 + 4);
}
