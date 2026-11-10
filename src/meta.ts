/** Прокачка между забегами: кости 🦴 за забеги → постоянные бонусы в «Мастерской». */
export interface MetaDef { id: string; icon: string; name: string; max: number; desc: (l: number) => string; cost: number[] }

export const META: MetaDef[] = [
  { id: 'hp', icon: '❤️', name: 'Крепкое тело', max: 5, desc: (l) => `+${10 * l} к макс. HP`, cost: [40, 80, 140, 220, 320] },
  { id: 'dmg', icon: '🗡️', name: 'Острый край', max: 5, desc: (l) => `+${0.5 * l} к урону свайпа`, cost: [50, 100, 170, 260, 380] },
  { id: 'energy', icon: '⚡', name: 'Выносливость', max: 5, desc: (l) => `+${10 * l} энергии и +${3 * l}/с восстановления`, cost: [40, 80, 140, 220, 320] },
  { id: 'xp', icon: '📚', name: 'Учёность', max: 5, desc: (l) => `+${8 * l}% опыта`, cost: [40, 80, 140, 220, 320] },
  { id: 'magnet', icon: '🧲', name: 'Притяжение', max: 3, desc: (l) => `+${20 * l}% радиус сбора`, cost: [30, 70, 130] },
  { id: 'speed', icon: '👟', name: 'Лёгкий шаг', max: 3, desc: (l) => `+${4 * l}% к скорости`, cost: [50, 110, 200] },
  { id: 'reroll', icon: '🎲', name: 'Удача', max: 3, desc: (l) => `+${l} реролл в начале забега`, cost: [60, 140, 260] },
  { id: 'revive', icon: '🪶', name: 'Последний шанс', max: 1, desc: () => 'Одно воскрешение за забег', cost: [500] },
];

export interface MetaState { bones: number; lv: Record<string, number> }

export function loadMeta(): MetaState {
  try {
    const m = JSON.parse(localStorage.getItem('ss_meta') || 'null');
    if (m && typeof m.bones === 'number') return { bones: m.bones, lv: m.lv ?? {} };
  } catch { /* ignore */ }
  return { bones: 0, lv: {} };
}

export function saveMeta(m: MetaState) {
  try { localStorage.setItem('ss_meta', JSON.stringify(m)); } catch { /* ignore */ }
}

export function addBones(n: number) {
  const m = loadMeta();
  m.bones += Math.max(0, Math.round(n));
  saveMeta(m);
  return m.bones;
}

export function buyMeta(id: string): boolean {
  const m = loadMeta();
  const d = META.find((x) => x.id === id);
  const l = m.lv[id] ?? 0;
  if (!d || l >= d.max || m.bones < d.cost[l]) return false;
  m.bones -= d.cost[l];
  m.lv[id] = l + 1;
  saveMeta(m);
  return true;
}

export interface MetaBonus { hp: number; dmg: number; energy: number; regen: number; xp: number; magnet: number; speed: number; rerolls: number; revive: number }

export function metaBonus(lv: Record<string, number> = {}): MetaBonus {
  const v = (id: string) => lv[id] ?? 0;
  return {
    hp: 10 * v('hp'), dmg: 0.5 * v('dmg'), energy: 10 * v('energy'), regen: 3 * v('energy'),
    xp: 0.08 * v('xp'), magnet: 0.2 * v('magnet'), speed: 0.04 * v('speed'), rerolls: v('reroll'), revive: v('revive'),
  };
}
