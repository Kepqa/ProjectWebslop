/** Прокачка между забегами: кости 🦴 за забеги → постоянные бонусы в «Мастерской». */
export interface MetaDef { id: string; icon: string; name: string; max: number; desc: (l: number) => string; cost: number[] }

export const META: MetaDef[] = [
  { id: 'hp', icon: '❤️', name: 'Крепкое тело', max: 5, desc: (l) => `+${10 * l} к макс. HP`, cost: [40, 80, 140, 220, 320] },
  { id: 'dmg', icon: '🗡️', name: 'Острый край', max: 5, desc: (l) => `+${0.5 * l} к урону свайпа`, cost: [50, 100, 170, 260, 380] },
  { id: 'energy', icon: '📏', name: 'Длинный взмах', max: 5, desc: (l) => `Взмах режет на ${6 * l}% дальше`, cost: [40, 80, 140, 220, 320] },
  { id: 'xp', icon: '📚', name: 'Учёность', max: 5, desc: (l) => `+${8 * l}% опыта`, cost: [40, 80, 140, 220, 320] },
  { id: 'magnet', icon: '🧲', name: 'Притяжение', max: 3, desc: (l) => `+${20 * l}% радиус сбора`, cost: [30, 70, 130] },
  { id: 'speed', icon: '👟', name: 'Лёгкий шаг', max: 3, desc: (l) => `+${4 * l}% к скорости`, cost: [50, 110, 200] },
  { id: 'reroll', icon: '🎲', name: 'Удача', max: 3, desc: (l) => `+${l} реролл в начале забега`, cost: [60, 140, 260] },
  { id: 'revive', icon: '🪶', name: 'Последний шанс', max: 1, desc: () => 'Одно воскрешение за забег', cost: [500] },
];

/**
 * Клинки — стартовое оружие. Меняют не цифру, а то, как ощущается взмах:
 * длину реза, ширину следа, отдачу. Покупаются один раз, выбирается один.
 */
export interface BladeDef { id: string; icon: string; name: string; desc: string; cost: number; len: number; width: number; dmg: number; knock: number; momentum: number; refund: number; color: number }

export const BLADES: BladeDef[] = [
  { id: 'cleaver', icon: '🔪', name: 'Тесак', desc: 'Ровный клинок без сюрпризов.', cost: 0, len: 1, width: 1, dmg: 1, knock: 1, momentum: 0, refund: 0, color: 0x66d9e8 },
  { id: 'rapier', icon: '🤺', name: 'Рапира', desc: 'Взмах в полтора раза длиннее, но след узкий. Резкие взмахи бьют до +60% сильнее.', cost: 150, len: 1.5, width: 0.7, dmg: 0.9, knock: 0.7, momentum: 0.6, refund: 0, color: 0xd0bfff },
  { id: 'hammer', icon: '🔨', name: 'Молот', desc: 'Короткий широкий удар: вдвое шире, в 1.6 раза больнее, расшвыривает толпу.', cost: 300, len: 0.55, width: 2, dmg: 1.6, knock: 2, momentum: 0, refund: 0, color: 0xffc078 },
  { id: 'sickle', icon: '🌙', name: 'Серп', desc: 'Взмах короче, но каждое убийство продлевает его — режь цепочкой, пока есть кого.', cost: 450, len: 0.7, width: 1.1, dmg: 1, knock: 0.8, momentum: 0, refund: 45, color: 0x8ce99a },
];

export interface MetaState { bones: number; lv: Record<string, number>; blade: string; blades: string[] }

export function loadMeta(): MetaState {
  try {
    const m = JSON.parse(localStorage.getItem('ss_meta') || 'null');
    if (m && typeof m.bones === 'number') return { bones: m.bones, lv: m.lv ?? {}, blade: m.blade ?? 'cleaver', blades: m.blades ?? ['cleaver'] };
  } catch { /* ignore */ }
  return { bones: 0, lv: {}, blade: 'cleaver', blades: ['cleaver'] };
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

/** Купить клинок (если ещё нет) и взять его в руку. */
export function pickBlade(id: string): boolean {
  const m = loadMeta();
  const d = BLADES.find((b) => b.id === id);
  if (!d) return false;
  if (!m.blades.includes(id)) {
    if (m.bones < d.cost) return false;
    m.bones -= d.cost; m.blades.push(id);
  }
  m.blade = id;
  saveMeta(m);
  return true;
}

export interface MetaBonus { hp: number; dmg: number; reach: number; blade: string; xp: number; magnet: number; speed: number; rerolls: number; revive: number }

export function metaBonus(lv: Record<string, number> = {}, blade = 'cleaver'): MetaBonus {
  const v = (id: string) => lv[id] ?? 0;
  return {
    hp: 10 * v('hp'), dmg: 0.5 * v('dmg'), reach: 0.06 * v('energy'), blade,
    xp: 0.08 * v('xp'), magnet: 0.2 * v('magnet'), speed: 0.04 * v('speed'), rerolls: v('reroll'), revive: v('revive'),
  };
}
