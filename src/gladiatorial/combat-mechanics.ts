/** Описания и числа боевых механик арены. */

export type EnemyArchetype = 'dummy' | 'ricochet' | 'dancer' | 'wall' | 'berserker' | 'brute';

export type AttackPattern = 'normal' | 'feint' | 'double' | 'heavy';

export interface MechanicInfo {
  id: string;
  title: string;
  blurb: string;
}

export const COMBAT_MECHANICS: MechanicInfo[] = [
  {
    id: 'feint',
    title: 'Финт',
    blurb: 'Враг обрывает замах. Ранний блок зря жрёт щит; дождись настоящего удара.',
  },
  {
    id: 'double',
    title: 'Двойной удар',
    blurb: 'После первого хита — короткая пауза и второй, слабее. Блок держит оба; контра лучше на второй.',
  },
  {
    id: 'heavy',
    title: 'Тяжёлый замах',
    blurb: 'Долгий телеграф и огромный урон. Идеальный блок или парирование открывают сильный ответ.',
  },
  {
    id: 'shield',
    title: 'Щит-ресурс',
    blurb: 'Каждый блок снимает прочность щита. На нуле блок слабее, пока щит не восстановится.',
  },
  {
    id: 'knockback',
    title: 'Отталкивание',
    blurb: 'Идеальный блок отбрасывает врага. Следующий выпад в окне бьёт заметно сильнее.',
  },
  {
    id: 'clinch',
    title: 'Клинч',
    blurb: 'Если вы бьёте почти одновременно — оба получают урезанный урон, серии сбрасываются.',
  },
  {
    id: 'blood',
    title: 'Кровавая серия',
    blurb: 'Три попадания без срыва открывают «Добивание» — мощный финиш одной кнопкой.',
  },
  {
    id: 'parry',
    title: 'Парирование',
    blurb: 'Контр — узкое окно: полный иммун и контрудар. Раньше финта — наказание по щиту.',
  },
  {
    id: 'dancer',
    title: 'Танцор',
    blurb: 'Много финтов и короткий замах. Не жми блок заранее.',
  },
  {
    id: 'wall',
    title: 'Стена',
    blurb: 'Редко финтит, бьёт тяжело. Иногда гасит твой выпад своим щитом.',
  },
  {
    id: 'berserker',
    title: 'Берсерк',
    blurb: 'Чем меньше HP у врага, тем короче его замах. Дожимай аккуратно.',
  },
  {
    id: 'ricochet',
    title: 'Рикошет столба',
    blurb: 'Столб не бьёт сам, но удар в плохом ритме слегка станит тебя — тренировка тайминга.',
  },
  {
    id: 'break',
    title: 'Слом стойки',
    blurb: 'Несколько успешных блоков подряд ломают врага на секунду — окно для выпада.',
  },
  {
    id: 'sand',
    title: 'Песок арены',
    blurb: 'Идеальный блок поднимает пыль и на миг замедляет врага — награда за тайминг.',
  },
];

export interface ArchetypeCombat {
  archetype: EnemyArchetype;
  label: string;
  feintChance: number;
  doubleChance: number;
  heavyChance: number;
  /** Шанс погасить выпад игрока. */
  wallBlockChance: number;
  /** Рикошет при частых ударах по столбу. */
  ricochet: boolean;
  /** Сколько блоков подряд до слома стойки. */
  blocksToBreak: number;
  breakStunMs: number;
  mechanicIds: string[];
}

export const ARCHETYPE_COMBAT: Record<EnemyArchetype, ArchetypeCombat> = {
  dummy: {
    archetype: 'dummy',
    label: 'Тренажёр',
    feintChance: 0,
    doubleChance: 0,
    heavyChance: 0,
    wallBlockChance: 0,
    ricochet: false,
    blocksToBreak: 99,
    breakStunMs: 0,
    mechanicIds: ['blood', 'shield'],
  },
  ricochet: {
    archetype: 'ricochet',
    label: 'Рикошет',
    feintChance: 0,
    doubleChance: 0,
    heavyChance: 0,
    wallBlockChance: 0,
    ricochet: true,
    blocksToBreak: 99,
    breakStunMs: 0,
    mechanicIds: ['ricochet', 'blood'],
  },
  dancer: {
    archetype: 'dancer',
    label: 'Танцор',
    feintChance: 0.38,
    doubleChance: 0.22,
    heavyChance: 0.06,
    wallBlockChance: 0.05,
    ricochet: false,
    blocksToBreak: 3,
    breakStunMs: 1100,
    mechanicIds: ['dancer', 'feint', 'double', 'parry', 'break', 'sand'],
  },
  wall: {
    archetype: 'wall',
    label: 'Стена',
    feintChance: 0.08,
    doubleChance: 0.18,
    heavyChance: 0.16,
    wallBlockChance: 0.42,
    ricochet: false,
    blocksToBreak: 4,
    breakStunMs: 900,
    mechanicIds: ['wall', 'heavy', 'shield', 'knockback', 'break'],
  },
  berserker: {
    archetype: 'berserker',
    label: 'Берсерк',
    feintChance: 0.12,
    doubleChance: 0.2,
    heavyChance: 0.14,
    wallBlockChance: 0.08,
    ricochet: false,
    blocksToBreak: 3,
    breakStunMs: 1000,
    mechanicIds: ['berserker', 'heavy', 'blood', 'clinch', 'sand'],
  },
  brute: {
    archetype: 'brute',
    label: 'Глыба',
    feintChance: 0.1,
    doubleChance: 0.15,
    heavyChance: 0.28,
    wallBlockChance: 0.18,
    ricochet: false,
    blocksToBreak: 3,
    breakStunMs: 1200,
    mechanicIds: ['heavy', 'knockback', 'parry', 'clinch', 'sand', 'break'],
  },
};

export const SHIELD_MAX = 100;
export const SHIELD_COST_BLOCK = 14;
export const SHIELD_COST_PERFECT = 5;
export const SHIELD_COST_FEINT_PUNISH = 22;
export const SHIELD_REGEN_PER_CYCLE = 12;
export const SHIELD_BROKEN_FACTOR = 0.55;

export const PERFECT_BLOCK_MS = 250;
export const PARRY_WINDOW_MS = 160;
export const KNOCKBACK_BONUS_MS = 1400;
export const KNOCKBACK_DAMAGE_MUL = 1.35;
export const CLINCH_WINDOW_MS = 280;
export const CLINCH_DAMAGE_FACTOR = 0.45;
export const BLOOD_HITS_FOR_FINISH = 3;
export const FINISH_DAMAGE_MUL = 2.35;
export const DOUBLE_SECOND_FACTOR = 0.55;
export const HEAVY_DAMAGE_MUL = 1.85;
export const HEAVY_TELEGRAPH_MUL = 1.55;
export const RICOCHET_GAP_MS = 420;
export const RICOCHET_STUN_MS = 380;

export function rollAttackPattern(combat: ArchetypeCombat): AttackPattern {
  const roll = Math.random();
  let cursor = combat.feintChance;
  if (roll < cursor) return 'feint';
  cursor += combat.doubleChance;
  if (roll < cursor) return 'double';
  cursor += combat.heavyChance;
  if (roll < cursor) return 'heavy';
  return 'normal';
}

export function berserkerTelegraphMul(hpRatio: number): number {
  // 1.0 при полном HP → ~0.45 при почти нуле.
  return 0.45 + 0.55 * Math.max(0, Math.min(1, hpRatio));
}

export function mechanicsForIds(ids: string[]): MechanicInfo[] {
  return ids
    .map((id) => COMBAT_MECHANICS.find((m) => m.id === id))
    .filter((m): m is MechanicInfo => Boolean(m));
}
