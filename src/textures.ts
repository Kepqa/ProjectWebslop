import Phaser from 'phaser';

/** Текстуры рисуются в S раз крупнее и уменьшаются при отрисовке — чётко на retina. */
export const S = 2;

export type ZType = 'walker' | 'runner' | 'spitter' | 'charger' | 'brute' | 'jumper' | 'bomber' | 'shield' | 'ghost'
  | 'colossus' | 'brood' | 'leaper' | 'necro' | 'dog' | 'boar';

/** color — кожа, cloth — одежда/шкура. */
export interface ZLook { r: number; color: number; dark: number; eye: number; cloth?: number }

export const ZTYPES: ZType[] = ['walker', 'runner', 'spitter', 'charger', 'brute', 'jumper', 'bomber', 'shield', 'ghost', 'colossus', 'brood', 'leaper', 'necro', 'dog', 'boar'];
/** Кадров ходьбы на каждого персонажа. */
export const WALK_FRAMES = 4;

export const ZLOOK: Record<ZType, ZLook> = {
  walker: { r: 14, color: 0x8fb36a, dark: 0x3d5e25, eye: 0xffe066, cloth: 0x4c5f73 },
  runner: { r: 11, color: 0xa9bd63, dark: 0x5c6620, eye: 0xff6b6b, cloth: 0x8a3b3b },
  spitter: { r: 14, color: 0x6fc79a, dark: 0x22604a, eye: 0xd8f5a2, cloth: 0x5a6b3a },
  charger: { r: 18, color: 0xa47a5c, dark: 0x4a2f20, eye: 0xff8787, cloth: 0x3d3d45 },
  brute: { r: 26, color: 0x6f9a6a, dark: 0x22392a, eye: 0xffd43b, cloth: 0x6b5a3a },
  colossus: { r: 48, color: 0x7d8f55, dark: 0x2f3a1d, eye: 0xff6b6b, cloth: 0x4a3b2a },
  brood: { r: 44, color: 0x9e6a8a, dark: 0x40213a, eye: 0xffec99, cloth: 0x5a2a4a },
  jumper: { r: 13, color: 0xa58cf5, dark: 0x4c2d91, eye: 0xffe066, cloth: 0x3b2a6b },
  bomber: { r: 15, color: 0x9fb36a, dark: 0x7c2d12, eye: 0xfff3bf, cloth: 0xd9480f },
  shield: { r: 16, color: 0x8fa38a, dark: 0x343a40, eye: 0xff6b6b, cloth: 0x495057 },
  ghost: { r: 13, color: 0xd0ebff, dark: 0x748ffc, eye: 0x1c7ed6, cloth: 0xa5d8ff },
  leaper: { r: 40, color: 0x8c6ef0, dark: 0x30187a, eye: 0xffd43b, cloth: 0x4c2d91 },
  necro: { r: 30, color: 0xbac8d3, dark: 0x1e0f4a, eye: 0x63e6be, cloth: 0x3b2a6b },
  dog: { r: 11, color: 0x8a735a, dark: 0x3e3226, eye: 0xff6b6b, cloth: 0x6b5844 },
  boar: { r: 17, color: 0x6b5a4a, dark: 0x2f261d, eye: 0xffa94d, cloth: 0x584838 },
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

  // Игроки: плащ, капюшон, клинок; 4 кадра шагов (второй игрок — оранжевый)
  for (const [key, c1, c2, c3] of [['player', 0x1864ab, 0x4dabf7, 0xd0ebff], ['player2', 0xc2410c, 0xffa94d, 0xffe8cc]] as const) {
    for (let f = 0; f <= WALK_FRAMES; f++) {
      const sw = f === WALK_FRAMES ? 0 : Math.sin((f / WALK_FRAMES) * Math.PI * 2);
      g.fillStyle(0x000000, 0.3).fillEllipse(21 * s, 24 * s, 34 * s, 30 * s);
      // ботинки
      g.fillStyle(0x343a40).fillEllipse((19 + sw * 6) * s, 15 * s, 9 * s, 6 * s).fillEllipse((19 - sw * 6) * s, 29 * s, 9 * s, 6 * s);
      // плащ (плечи) и капюшон
      g.fillStyle(c1).fillEllipse(20 * s, 22 * s, 22 * s, 30 * s);
      g.fillStyle(0x000000, 0.18).fillEllipse(17 * s, 24 * s, 16 * s, 26 * s);
      g.lineStyle(2 * s, 0x0b1a2a, 0.9).strokeEllipse(20 * s, 22 * s, 22 * s, 30 * s);
      // рука с клинком
      g.fillStyle(c2).fillEllipse((30 + sw * 1.5) * s, 30 * s, 9 * s, 6 * s);
      g.fillStyle(0xe7f5ff).fillRect(31 * s, 28.5 * s, 12 * s, 3 * s);
      g.fillStyle(0xffffff).fillTriangle(42 * s, 26.5 * s, 42 * s, 33.5 * s, 46 * s, 30 * s);
      g.fillStyle(c2).fillCircle(25 * s, 22 * s, 9 * s);
      g.fillStyle(c3, 0.9).fillCircle(29 * s, 18.5 * s, 2 * s).fillCircle(29 * s, 25.5 * s, 2 * s);
      g.lineStyle(2 * s, 0xffffff, 0.9).strokeCircle(25 * s, 22 * s, 9 * s);
      gen(f === WALK_FRAMES ? key : `${key}_w${f}`, 46, 44);
    }
  }

  for (const t of Object.keys(ZLOOK) as ZType[]) {
    for (let f = 0; f < WALK_FRAMES; f++) drawZombie(g, t, gen, false, f);
    drawZombie(g, t, gen);
  }
  for (let f = 0; f < WALK_FRAMES; f++) drawZombie(g, 'shield', gen, true, f);
  drawZombie(g, 'shield', gen, true);

  // Могила
  g.fillStyle(0x000000, 0.35).fillEllipse(25 * s, 44 * s, 40 * s, 10 * s);
  g.fillStyle(0x4a4458).fillRect(9 * s, 34 * s, 32 * s, 10 * s);
  g.fillStyle(0x7c7591).fillRoundedRect(13 * s, 6 * s, 24 * s, 32 * s, { tl: 12 * s, tr: 12 * s, bl: 0, br: 0 });
  g.fillStyle(0x5c556e).fillRect(23 * s, 13 * s, 4 * s, 16 * s).fillRect(18 * s, 17 * s, 14 * s, 4 * s);
  g.fillStyle(0x63e6be, 0.5).fillCircle(25 * s, 40 * s, 3 * s);
  gen('grave', 50, 50);

  g.fillStyle(0xe5dbff, 0.25).fillCircle(14 * s, 14 * s, 14 * s);
  g.fillStyle(0x9775fa, 0.5).fillCircle(14 * s, 14 * s, 11 * s);
  g.fillStyle(0x2b1a5c).fillCircle(14 * s, 14 * s, 8 * s);
  g.fillStyle(0xe5dbff).fillCircle(14 * s, 14 * s, 6.5 * s);
  g.fillStyle(0xffffff, 0.9).fillCircle(11.5 * s, 11.5 * s, 2.5 * s);
  gen('orb', 28, 28);

  g.fillStyle(0xe7f5ff);
  g.fillTriangle(14 * s, 0, 18 * s, 14 * s, 10 * s, 14 * s).fillTriangle(28 * s, 14 * s, 14 * s, 18 * s, 14 * s, 10 * s);
  g.fillTriangle(14 * s, 28 * s, 10 * s, 14 * s, 18 * s, 14 * s).fillTriangle(0, 14 * s, 14 * s, 10 * s, 14 * s, 18 * s);
  g.fillStyle(0x66d9e8).fillCircle(14 * s, 14 * s, 4 * s);
  gen('boomerang', 28, 28);

  g.fillStyle(0x495057).fillCircle(8 * s, 9 * s, 7 * s);
  g.fillStyle(0x868e96).fillCircle(6 * s, 7 * s, 2.5 * s);
  g.fillStyle(0xffa94d).fillRect(7 * s, 0, 2 * s, 3 * s);
  gen('grenade', 16, 17);

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

  g.fillStyle(0xd8f5a2, 0.25).fillCircle(14 * s, 14 * s, 14 * s);
  g.fillStyle(0x94d82d, 0.45).fillCircle(14 * s, 14 * s, 11 * s);
  g.fillStyle(0x1b3a0a).fillCircle(14 * s, 14 * s, 8 * s);
  g.fillStyle(0xd8f5a2).fillCircle(14 * s, 14 * s, 6.5 * s);
  g.fillStyle(0xffffff, 0.9).fillCircle(11.5 * s, 11.5 * s, 2.5 * s);
  gen('acid', 28, 28);

  // Ящик (размер тайла 48)
  g.fillStyle(0x000000, 0.35).fillRect(4 * s, 8 * s, 44 * s, 42 * s);
  g.fillStyle(0x9c6b3a).fillRect(3 * s, 3 * s, 42 * s, 42 * s);
  g.fillStyle(0x7a4f28).fillRect(3 * s, 3 * s, 42 * s, 6 * s).fillRect(3 * s, 39 * s, 42 * s, 6 * s)
    .fillRect(3 * s, 3 * s, 6 * s, 42 * s).fillRect(39 * s, 3 * s, 6 * s, 42 * s);
  g.lineStyle(5 * s, 0x7a4f28).lineBetween(8 * s, 8 * s, 40 * s, 40 * s);
  g.lineStyle(2 * s, 0x3b2412).strokeRect(3 * s, 3 * s, 42 * s, 42 * s);
  gen('crate', 50, 50);

  // Двери (48 по ширине тайла)
  g.fillStyle(0x000000, 0.35).fillRect(0, 9 * s, 48 * s, 9 * s);
  g.fillStyle(0x8a5a2b).fillRect(0, 4 * s, 48 * s, 12 * s);
  g.fillStyle(0x6b4320).fillRect(0, 4 * s, 48 * s, 3 * s).fillRect(0, 13 * s, 48 * s, 3 * s);
  g.fillStyle(0xffd43b).fillCircle(38 * s, 10 * s, 2 * s);
  g.lineStyle(1.5 * s, 0x3b2412).strokeRect(0.5 * s, 4 * s, 47 * s, 12 * s);
  gen('door', 48, 20);
  g.fillStyle(0x6b4320, 0.9).fillRect(0, 4 * s, 7 * s, 12 * s).fillRect(41 * s, 4 * s, 7 * s, 12 * s);
  g.lineStyle(1 * s, 0x3b2412).strokeRect(0.5 * s, 4 * s, 6 * s, 12 * s).strokeRect(41.5 * s, 4 * s, 6 * s, 12 * s);
  gen('door_open', 48, 20);

  // Аптечка-сердце
  g.fillStyle(0x000000, 0.3).fillEllipse(11 * s, 21 * s, 18 * s, 5 * s);
  g.fillStyle(0xfa5252).fillCircle(7 * s, 8 * s, 5.5 * s).fillCircle(15 * s, 8 * s, 5.5 * s)
    .fillTriangle(1.8 * s, 10 * s, 20.2 * s, 10 * s, 11 * s, 19 * s);
  g.fillStyle(0xffffff, 0.85).fillRect(9.5 * s, 5 * s, 3 * s, 9 * s).fillRect(6.5 * s, 8 * s, 9 * s, 3 * s);
  gen('medkit', 22, 23);

  // Копьё (смотрит вправо)
  g.fillStyle(0x66d9e8, 0.35).fillEllipse(22 * s, 6 * s, 44 * s, 10 * s);
  g.fillStyle(0xadb5bd).fillRect(2 * s, 5 * s, 30 * s, 2.5 * s);
  g.fillStyle(0xffffff).fillTriangle(30 * s, 1.5 * s, 30 * s, 10.5 * s, 44 * s, 6 * s);
  g.fillStyle(0x66d9e8).fillTriangle(32 * s, 3.5 * s, 32 * s, 8.5 * s, 40 * s, 6 * s);
  gen('spear', 44, 12);

  // Осколок
  g.fillStyle(0xe7f5ff).fillPoints([{ x: 0, y: 4 * s }, { x: 10 * s, y: 0 }, { x: 16 * s, y: 4 * s }, { x: 10 * s, y: 8 * s }], true);
  g.fillStyle(0x99e9f2).fillTriangle(10 * s, 1.5 * s, 15 * s, 4 * s, 10 * s, 6.5 * s);
  gen('shard', 16, 8);

  // Звезда-мина
  const star: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 4.5 : 10; star.push({ x: (11 + Math.cos(a) * rr) * s, y: (11 + Math.sin(a) * rr) * s }); }
  g.fillStyle(0xffd43b).fillPoints(star, true);
  g.lineStyle(1.5 * s, 0xe67700).strokePoints(star, true);
  gen('mine', 22, 22);

  // Взрывная бочка (вид сверху)
  g.fillStyle(0x000000, 0.35).fillEllipse(16 * s, 19 * s, 30 * s, 12 * s);
  g.fillStyle(0xc92a2a).fillCircle(15 * s, 15 * s, 13 * s);
  g.lineStyle(2.5 * s, 0x5c0a0a).strokeCircle(15 * s, 15 * s, 13 * s);
  g.lineStyle(1.5 * s, 0x862e2e).strokeCircle(15 * s, 15 * s, 8.5 * s);
  g.fillStyle(0xffd43b).fillTriangle(15 * s, 8 * s, 21 * s, 19 * s, 9 * s, 19 * s);
  g.fillStyle(0x1a1a1a).fillRect(14 * s, 11 * s, 2 * s, 4.5 * s).fillRect(14 * s, 16.5 * s, 2 * s, 1.6 * s);
  gen('barrel', 32, 32);

  // Тотем: каменный столб с глазом
  g.fillStyle(0x000000, 0.35).fillEllipse(14 * s, 25 * s, 24 * s, 9 * s);
  g.fillStyle(0x495057).fillRoundedRect(5 * s, 2 * s, 18 * s, 23 * s, 4 * s);
  g.fillStyle(0x343a40).fillRect(5 * s, 10 * s, 18 * s, 3 * s);
  g.fillStyle(0x74c0fc).fillCircle(14 * s, 7 * s, 3 * s).fillCircle(14 * s, 18 * s, 2.2 * s);
  g.lineStyle(1.5 * s, 0x212529).strokeRoundedRect(5 * s, 2 * s, 18 * s, 23 * s, 4 * s);
  gen('totem', 28, 28);

  // Душа (самонаводящийся снаряд)
  g.fillStyle(0xb2f2bb, 0.35).fillCircle(9 * s, 9 * s, 9 * s);
  g.fillStyle(0xd3f9d8).fillCircle(9 * s, 9 * s, 5.5 * s);
  g.fillStyle(0x2b8a3e).fillCircle(7 * s, 8 * s, 1.2 * s).fillCircle(11 * s, 8 * s, 1.2 * s);
  gen('soul', 18, 18);

  // Капкан
  g.lineStyle(2.5 * s, 0x868e96).strokeCircle(13 * s, 13 * s, 10 * s);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.fillStyle(0xced4da).fillTriangle(13 * s + Math.cos(a) * 10 * s, 13 * s + Math.sin(a) * 10 * s, 13 * s + Math.cos(a + 0.25) * 6 * s, 13 * s + Math.sin(a + 0.25) * 6 * s, 13 * s + Math.cos(a - 0.25) * 6 * s, 13 * s + Math.sin(a - 0.25) * 6 * s);
  }
  g.fillStyle(0x495057).fillCircle(13 * s, 13 * s, 3 * s);
  gen('trap', 26, 26);

  // Рикошет-шар
  g.fillStyle(0xf8f9fa).fillCircle(8 * s, 8 * s, 7 * s);
  g.fillStyle(0x4dabf7).fillCircle(8 * s, 8 * s, 3.2 * s);
  g.lineStyle(1.5 * s, 0x1c7ed6).strokeCircle(8 * s, 8 * s, 7 * s);
  gen('ball', 16, 16);

  g.destroy();
}

/** Зомби сверху: тень, ступни (кадр шага), руки вперёд, плечи в одежде, голова. frame=-1 — стоячий кадр. */
function drawZombie(g: Phaser.GameObjects.Graphics, t: ZType, gen: (k: string, w: number, h: number) => void, broken = false, frame = -1) {
  const s = S;
  const L = ZLOOK[t];
  const { r, color, dark, eye } = L;
  const cloth = L.cloth ?? dark;
  const W = Math.ceil(r * 3.3), H = Math.ceil(r * 2.6);
  const cx = r * 1.25 * s, cy = (H / 2) * s, R = r * s;
  const sw = frame < 0 ? 0 : Math.sin((frame / WALK_FRAMES) * Math.PI * 2);
  const key = (broken ? 'shield_broken' : t) + (frame < 0 ? '' : `_w${frame}`);
  const ghost = t === 'ghost';
  const a = ghost ? 0.75 : 1;

  if (t === 'dog' || t === 'boar') { drawBeast(g, t, cx, cy, R, sw); gen(key, W, H); if (frame < 0) drawHalf(g, t, gen); return; }

  g.fillStyle(0x000000, 0.28).fillEllipse(cx - R * 0.05, cy + 3 * s, R * 2.3, R * 2.4);
  // ступни — шагают в противофазе
  if (!ghost) {
    g.fillStyle(0x2b2b2b);
    g.fillEllipse(cx - R * 0.2 + sw * R * 0.45, cy - R * 0.4, R * 0.55, R * 0.4);
    g.fillEllipse(cx - R * 0.2 - sw * R * 0.45, cy + R * 0.4, R * 0.55, R * 0.4);
  } else {
    g.fillStyle(cloth, 0.4);
    for (let i = 0; i < 3; i++) g.fillTriangle(cx - R * 0.5, cy - R * 0.7 + i * R * 0.7, cx - R * (1.5 + sw * 0.15), cy - R * 0.35 + i * R * 0.7, cx - R * 0.5, cy + i * R * 0.7 - R * 0.1);
  }
  // руки (тянутся вперёд, качаются в шаге)
  const armLen = t === 'charger' ? 1.2 : t === 'spitter' || t === 'bomber' ? 0.85 : t === 'necro' ? 1.3 : t === 'shield' ? 0.9 : 1.75;
  const la = armLen * (1 + sw * 0.14), ra = armLen * (1 - sw * 0.14);
  g.fillStyle(cloth, a).fillRect(cx - R * 0.1, cy - R * 0.86, R * (la * 0.55), R * 0.32).fillRect(cx - R * 0.1, cy + R * 0.54, R * (ra * 0.55), R * 0.32);
  g.fillStyle(color, a).fillRect(cx + R * (la * 0.45 - 0.1), cy - R * 0.83, R * (la * 0.55), R * 0.26).fillRect(cx + R * (ra * 0.45 - 0.1), cy + R * 0.57, R * (ra * 0.55), R * 0.26);
  g.fillStyle(color, a).fillCircle(cx + R * (la - 0.05), cy - R * 0.7, R * 0.19).fillCircle(cx + R * (ra - 0.05), cy + R * 0.7, R * 0.19);
  if (t === 'jumper' || t === 'leaper') {
    g.fillStyle(dark).fillEllipse(cx - R * 0.6, cy - R * 0.95, R * 1.1, R * 0.45).fillEllipse(cx - R * 0.6, cy + R * 0.95, R * 1.1, R * 0.45);
  }
  // плечи/торс
  g.fillStyle(cloth, a).fillEllipse(cx - R * 0.15, cy, R * 1.35, R * 2.05);
  g.fillStyle(0x000000, 0.22).fillEllipse(cx - R * 0.35, cy + R * 0.1, R * 0.8, R * 1.7);
  g.fillStyle(0xffffff, 0.08).fillEllipse(cx - R * 0.05, cy - R * 0.4, R * 0.7, R * 0.7);
  // пятна крови (детерминированные)
  if (!ghost) {
    g.fillStyle(0x6b1a22, 0.75).fillCircle(cx - R * 0.3, cy + R * 0.35, R * 0.18).fillCircle(cx - R * 0.05, cy - R * 0.55, R * 0.12);
  }
  g.lineStyle(Math.max(1.5, r * 0.09) * s, 0x111111, 0.6).strokeEllipse(cx - R * 0.15, cy, R * 1.35, R * 2.05);
  // особенности
  if (t === 'bomber') {
    g.fillStyle(0x212529).fillCircle(cx - R * 0.2, cy, R * 0.5);
    g.fillStyle(0xffd43b).fillRect(cx - R * 0.25, cy - R * 0.08, R * 0.45, R * 0.16);
    g.lineStyle(2 * s, 0xffa94d).lineBetween(cx - R * 0.6, cy - R * 0.5, cx - R * 1.0, cy - R * 0.85);
    g.fillStyle(0xfff3bf).fillCircle(cx - R * 1.0, cy - R * 0.85, R * 0.14);
  }
  if (t === 'spitter') g.fillStyle(0xa9e34b, 0.9).fillCircle(cx - R * 0.4, cy - R * 0.45, R * 0.3).fillCircle(cx - R * 0.5, cy + R * 0.35, R * 0.25);
  if (t === 'brood') {
    g.fillStyle(0xf3d9fa, 0.85);
    for (let i = 0; i < 6; i++) { const an = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8; g.fillCircle(cx - R * 0.15 + Math.cos(an) * R * 0.55, cy + Math.sin(an) * R * 0.75, R * 0.15); }
  }
  if (t === 'colossus' || t === 'brute') {
    g.lineStyle(2 * s, 0x2b1d1d, 0.8);
    for (let i = -2; i <= 2; i++) g.lineBetween(cx - R * 0.55 + i * R * 0.1, cy - R * 0.7, cx - R * 0.45 + i * R * 0.1, cy - R * 0.55);
    g.lineBetween(cx - R * 0.7, cy - R * 0.62, cx - R * 0.2, cy - R * 0.62);
  }
  // голова
  const hx = cx + R * 0.28, hr = R * (t === 'brute' || t === 'colossus' ? 0.5 : 0.58);
  if (t === 'necro') { g.fillStyle(0x1e0f4a).fillCircle(hx - R * 0.1, cy, hr * 1.25); }
  g.fillStyle(color, a).fillCircle(hx, cy, hr);
  g.fillStyle(0x000000, 0.15).fillCircle(hx - hr * 0.3, cy + hr * 0.2, hr * 0.7);
  g.lineStyle(Math.max(1.5, r * 0.08) * s, dark, 0.9).strokeCircle(hx, cy, hr);
  if (t === 'charger') {
    g.fillStyle(0xe9ecef).fillTriangle(hx + hr * 0.3, cy - hr * 0.8, hx + hr * 1.5, cy - hr * 1.2, hx + hr * 0.7, cy - hr * 0.2);
    g.fillTriangle(hx + hr * 0.3, cy + hr * 0.8, hx + hr * 1.5, cy + hr * 1.2, hx + hr * 0.7, cy + hr * 0.2);
  }
  if (t === 'spitter') g.fillStyle(0x1b3d2f).fillCircle(hx + hr * 0.8, cy, hr * 0.3);
  if (t === 'shield' && !broken) {
    g.fillStyle(0x000000, 0.3).fillRoundedRect(cx + R * 1.05, cy - R * 1.1, R * 0.5, R * 2.3, 3 * s);
    g.fillStyle(0xadb5bd).fillRoundedRect(cx + R * 0.95, cy - R * 1.15, R * 0.5, R * 2.3, 3 * s);
    g.fillStyle(0xdee2e6).fillRect(cx + R * 1.05, cy - R * 1.0, R * 0.12, R * 2.0);
    g.fillStyle(0x495057).fillCircle(cx + R * 1.2, cy - R * 0.7, R * 0.08).fillCircle(cx + R * 1.2, cy + R * 0.7, R * 0.08);
  }
  // глаза светятся
  const er = Math.max(1.6, r * 0.11) * s;
  g.fillStyle(eye, 0.35).fillCircle(hx + hr * 0.55, cy - hr * 0.42, er * 1.8).fillCircle(hx + hr * 0.55, cy + hr * 0.42, er * 1.8);
  g.fillStyle(eye).fillCircle(hx + hr * 0.55, cy - hr * 0.42, er).fillCircle(hx + hr * 0.55, cy + hr * 0.42, er);
  gen(key, W, H);
  if (frame < 0 && !broken) drawHalf(g, t, gen);
}

/** Половинка для анимации разреза: торс в одежде, срез с кровью. */
function drawHalf(g: Phaser.GameObjects.Graphics, t: ZType, gen: (k: string, w: number, h: number) => void) {
  const s = S, { r, color } = ZLOOK[t], cloth = ZLOOK[t].cloth ?? color, R = r * s;
  g.fillStyle(cloth).slice((r + 2) * s, (r + 2) * s, R, 0, Math.PI, false).fillPath();
  g.fillStyle(color).slice((r + 2) * s, (r + 2) * s, R * 0.55, 0, Math.PI, false).fillPath();
  g.fillStyle(0x8c2f39).fillRect(2 * s, (r + 1) * s, r * 2 * s, 3 * s);
  g.fillStyle(0xc92a2a).fillRect(4 * s, (r + 1.5) * s, (r * 2 - 4) * s, 1.5 * s);
  gen(`${t}_half`, r * 2 + 4, r * 2 + 4);
}

/** Звери: собака (вытянутая, хвост, уши) и кабан (массивный, клыки). Четыре лапы шагают по диагонали. */
function drawBeast(g: Phaser.GameObjects.Graphics, t: ZType, cx: number, cy: number, R: number, sw: number) {
  const s = S, L = ZLOOK[t];
  const boar = t === 'boar';
  const bl = boar ? 1.15 : 1.25, bw = boar ? 0.85 : 0.6;
  g.fillStyle(0x000000, 0.28).fillEllipse(cx - R * 0.1, cy + 3 * s, R * 2.6, R * 1.9);
  g.fillStyle(L.dark);
  const leg = (x: number, y: number, ph: number) => g.fillEllipse(cx + R * x + ph * R * 0.3, cy + R * y, R * 0.45, R * 0.3);
  leg(0.45, -bw * 0.95, sw); leg(0.45, bw * 0.95, -sw); leg(-0.7, -bw * 0.95, -sw); leg(-0.7, bw * 0.95, sw);
  if (!boar) { g.lineStyle(R * 0.18, L.cloth ?? L.dark).lineBetween(cx - R * 1.1, cy, cx - R * 1.6, cy + sw * R * 0.3); }
  g.fillStyle(L.cloth ?? L.color).fillEllipse(cx - R * 0.15, cy, R * bl * 2, R * bw * 2);
  g.fillStyle(0x000000, 0.2).fillEllipse(cx - R * 0.3, cy + R * 0.15, R * bl * 1.4, R * bw * 1.3);
  g.fillStyle(0x6b1a22, 0.7).fillCircle(cx - R * 0.3, cy - R * 0.2, R * 0.15);
  const hx = cx + R * (boar ? 0.95 : 1.05), hr = R * (boar ? 0.55 : 0.45);
  g.fillStyle(L.color).fillCircle(hx, cy, hr);
  if (boar) {
    g.fillStyle(0x4a3b2e).fillEllipse(hx + hr * 0.8, cy, hr * 0.8, hr * 0.9);
    g.fillStyle(0xf1f3f5).fillTriangle(hx + hr * 0.7, cy - hr * 0.5, hx + hr * 1.4, cy - hr * 0.9, hx + hr * 0.9, cy - hr * 0.2)
      .fillTriangle(hx + hr * 0.7, cy + hr * 0.5, hx + hr * 1.4, cy + hr * 0.9, hx + hr * 0.9, cy + hr * 0.2);
  } else {
    g.fillStyle(L.dark).fillTriangle(hx - hr * 0.4, cy - hr * 0.6, hx - hr * 0.9, cy - hr * 1.3, hx + hr * 0.1, cy - hr * 0.9)
      .fillTriangle(hx - hr * 0.4, cy + hr * 0.6, hx - hr * 0.9, cy + hr * 1.3, hx + hr * 0.1, cy + hr * 0.9);
    g.fillStyle(L.color).fillEllipse(hx + hr * 0.8, cy, hr * 1.1, hr * 0.8);
  }
  g.lineStyle(1.5 * s, L.dark, 0.9).strokeCircle(hx, cy, hr);
  g.fillStyle(L.eye).fillCircle(hx + hr * 0.4, cy - hr * 0.45, R * 0.1).fillCircle(hx + hr * 0.4, cy + hr * 0.45, R * 0.1);
}
