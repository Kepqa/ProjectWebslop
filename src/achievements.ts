import { isDev } from './stats';

/**
 * Ачивки и открытие предметов. Базовый набор предметов доступен сразу,
 * остальные открываются ачивками — так у прогрессии появляется цель.
 */
export interface Life {
  kills: number; bosses: number; runs: number; coop: number; falls: number;
  maxCombo: number; maxScore: number; maxWave: number; chapter: number; synergies: number; bestCh1: number;
}

export interface AchDef { id: string; icon: string; name: string; desc: string; done: (l: Life) => boolean; unlock?: string[]; prog?: (l: Life) => [number, number] }

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'kills100', icon: '🩸', name: 'Первая кровь', desc: 'Убей 100 зомби (за всё время)', done: (l) => l.kills >= 100, unlock: ['cross'], prog: (l) => [l.kills, 100] },
  { id: 'combo25', icon: '🔥', name: 'Разогрев', desc: 'Комбо 25', done: (l) => l.maxCombo >= 25, unlock: ['frenzy'], prog: (l) => [l.maxCombo, 25] },
  { id: 'combo50', icon: '🌊', name: 'В потоке', desc: 'Комбо 50', done: (l) => l.maxCombo >= 50, unlock: ['metronome'], prog: (l) => [l.maxCombo, 50] },
  { id: 'combo100', icon: '⚡', name: 'Безумие', desc: 'Комбо 100', done: (l) => l.maxCombo >= 100, unlock: ['finisher'], prog: (l) => [l.maxCombo, 100] },
  { id: 'wave5', icon: '⚔️', name: 'Полпути', desc: 'Дойди до 5-й волны', done: (l) => l.maxWave >= 5, unlock: ['spear'], prog: (l) => [l.maxWave, 5] },
  { id: 'wave10', icon: '🛡️', name: 'Выжил', desc: 'Пройди арену (10 волн)', done: (l) => l.maxWave >= 11, unlock: ['wave'], prog: (l) => [l.maxWave, 11] },
  { id: 'boss1', icon: '🏹', name: 'Охотник', desc: 'Убей босса', done: (l) => l.bosses >= 1, unlock: ['boomerang'], prog: (l) => [l.bosses, 1] },
  { id: 'boss10', icon: '👑', name: 'Истребитель', desc: 'Убей 10 боссов', done: (l) => l.bosses >= 10, unlock: ['phoenix'], prog: (l) => [l.bosses, 10] },
  { id: 'ch1', icon: '🏢', name: 'Прорыв', desc: 'Пройди главу 1', done: (l) => l.chapter >= 1, unlock: ['mirror'], prog: (l) => [l.chapter, 1] },
  { id: 'ch2', icon: '🏙️', name: 'Сквозь город', desc: 'Пройди главу 2', done: (l) => l.chapter >= 2, unlock: ['mines'], prog: (l) => [l.chapter, 2] },
  { id: 'ch3', icon: '🗺️', name: 'Мародёр', desc: 'Пройди главу 3', done: (l) => l.chapter >= 3, unlock: ['vortex'], prog: (l) => [l.chapter, 3] },
  { id: 'ch4', icon: '🚜', name: 'На колёсах', desc: 'Пройди главу 4', done: (l) => l.chapter >= 4, unlock: ['charge'], prog: (l) => [l.chapter, 4] },
  { id: 'kills1000', icon: '💀', name: 'Тысяча', desc: 'Убей 1000 зомби', done: (l) => l.kills >= 1000, unlock: ['shards'], prog: (l) => [l.kills, 1000] },
  { id: 'kills5000', icon: '☠️', name: 'Жнец', desc: 'Убей 5000 зомби', done: (l) => l.kills >= 5000, unlock: ['grenade'], prog: (l) => [l.kills, 5000] },
  { id: 'score50k', icon: '💯', name: 'Рекордсмен', desc: 'Набери 50 000 очков за забег', done: (l) => l.maxScore >= 50000, unlock: ['ricochet'], prog: (l) => [l.maxScore, 50000] },
  { id: 'synergy', icon: '🔗', name: 'Связка', desc: 'Открой первую синергию', done: (l) => l.synergies >= 1, unlock: ['reflect'] },
  { id: 'falls', icon: '🕳️', name: 'В бездну', desc: 'Сбрось 20 зомби в пропасть', done: (l) => l.falls >= 20, unlock: ['bell'], prog: (l) => [l.falls, 20] },
  { id: 'coop', icon: '👥', name: 'Вместе', desc: 'Сыграй в кооп', done: (l) => l.coop >= 1 },
  { id: 'runs10', icon: '🔁', name: 'Упорство', desc: 'Сыграй 10 забегов', done: (l) => l.runs >= 10, prog: (l) => [l.runs, 10] },
  { id: 'speed1', icon: '⏱️', name: 'Спринтер', desc: 'Пройди главу 1 быстрее 6 минут', done: (l) => l.bestCh1 > 0 && l.bestCh1 <= 360 },
];

/** Что открывается ачивками (остальное — сразу). */
export const LOCKED_BY: Record<string, AchDef> = {};
for (const a of ACHIEVEMENTS) for (const id of a.unlock ?? []) LOCKED_BY[id] = a;

interface Store { done: string[]; life: Life }

const EMPTY: Life = { kills: 0, bosses: 0, runs: 0, coop: 0, falls: 0, maxCombo: 0, maxScore: 0, maxWave: 0, chapter: 0, synergies: 0, bestCh1: 0 };

export function loadAch(): Store {
  try {
    const s = JSON.parse(localStorage.getItem('ss_ach') || 'null');
    if (s) return { done: s.done ?? [], life: { ...EMPTY, ...s.life } };
  } catch { /* ignore */ }
  return { done: [], life: { ...EMPTY } };
}

function saveAch(s: Store) {
  try { localStorage.setItem('ss_ach', JSON.stringify(s)); } catch { /* ignore */ }
}

/** Обновляет пожизненную статистику (сумма или максимум) и возвращает новые ачивки. */
export function recordLife(delta: Partial<Life>, max: Partial<Life> = {}): AchDef[] {
  const s = loadAch();
  for (const [k, v] of Object.entries(delta)) (s.life as unknown as Record<string, number>)[k] += v as number;
  for (const [k, v] of Object.entries(max)) {
    const L = s.life as unknown as Record<string, number>;
    if (k === 'bestCh1') L[k] = L[k] ? Math.min(L[k], v as number) : (v as number);
    else L[k] = Math.max(L[k], v as number);
  }
  const fresh = ACHIEVEMENTS.filter((a) => !s.done.includes(a.id) && a.done(s.life));
  s.done.push(...fresh.map((a) => a.id));
  saveAch(s);
  return fresh;
}

export function unlockedSet(): Set<string> | null {
  if (isDev()) return null; // в режиме разработчика доступно всё
  const done = new Set(loadAch().done);
  const set = new Set<string>();
  for (const [id, a] of Object.entries(LOCKED_BY)) if (done.has(a.id)) set.add(id);
  return set;
}

/** Доступен ли предмет: базовый или открыт ачивкой. */
export function isUnlocked(id: string, unlocked: Set<string> | null) {
  return !LOCKED_BY[id] || !unlocked || unlocked.has(id);
}

/** Ближайшие невыполненные ачивки с прогрессом — для экрана конца забега. */
export function nearestGoals(n = 3) {
  const st = loadAch();
  return ACHIEVEMENTS.filter((a) => !st.done.includes(a.id) && a.prog)
    .map((a) => { const [cur, goal] = a.prog!(st.life); return { a, cur: Math.min(cur, goal), goal, k: Math.min(1, cur / goal) }; })
    .sort((x, y) => (y.a.unlock ? 1 : 0) - (x.a.unlock ? 1 : 0) || y.k - x.k)
    .slice(0, n);
}
