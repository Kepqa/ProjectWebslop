import { ENEMY_SKINS, type EnemySkinId } from './enemy-skins';
import type { DummySpriteId } from './dummy-sprites';
import {
  ARCHETYPE_COMBAT,
  mechanicsForIds,
  type ArchetypeCombat,
  type EnemyArchetype,
  type MechanicInfo,
} from './combat-mechanics';

export type OpponentKind = 'training-dummy' | 'barbarian' | 'gladiator';

export interface Opponent {
  id: string;
  name: string;
  title: string;
  kind: OpponentKind;
  blurb: string;
  label: string;
  hp: number;
  damage: number;
  goldWin: [number, number];
  xpWin: number;
  xpLose: number;
  unlocked: boolean;
  archetype: EnemyArchetype;
  /** Скин из enemies/ — у Ульфа свой tinted after_PS. */
  skinId?: EnemySkinId;
  /** Спрайт неатакующего столба. */
  dummyId?: DummySpriteId;
  /** Множитель размера поверх скина (обычно 1). */
  scaleMul?: number;
  telegraphMs?: number;
  cooldownMs?: number;
  /** Tint поверх скина; для варвара Ульфа. */
  tint?: number;
}

export const OPPONENTS: Opponent[] = [
  {
    id: 'pall',
    name: 'Палл',
    title: 'Дуб',
    kind: 'training-dummy',
    archetype: 'dummy',
    dummyId: 'wood',
    blurb: 'Деревянный столб. Учит серии и добиванию — сам не бьёт.',
    label: 'ТРЕНИРОВКА · I',
    hp: 900,
    damage: 0,
    goldWin: [14, 20],
    xpWin: 18,
    xpLose: 6,
    unlocked: true,
  },
  {
    id: 'ferr',
    name: 'Ферр',
    title: 'Сталь',
    kind: 'training-dummy',
    archetype: 'ricochet',
    dummyId: 'metal',
    blurb: 'Металлический манекен с рикошетом: бей в ритме, иначе оглушит.',
    label: 'ТРЕНИРОВКА · II',
    hp: 1400,
    damage: 0,
    goldWin: [18, 26],
    xpWin: 24,
    xpLose: 8,
    unlocked: true,
  },
  {
    id: 'ulf',
    name: 'Ульф',
    title: 'Клык',
    kind: 'barbarian',
    archetype: 'berserker',
    blurb: 'Берсерк севера: чем меньше крови, тем короче замах. Читай темп.',
    label: 'СОПЕРНИК · III',
    hp: 1200,
    damage: 110,
    goldWin: [28, 40],
    xpWin: 35,
    xpLose: 12,
    unlocked: true,
    tint: 0xffb089,
    telegraphMs: 700,
    cooldownMs: 860,
  },
  {
    id: 'lin',
    name: 'Линь',
    title: 'Ива',
    kind: 'gladiator',
    archetype: 'dancer',
    skinId: 'lin',
    blurb: 'Танцор арены: финты и двойные удары. Не жми блок заранее.',
    label: 'СОПЕРНИК · IV',
    hp: 1100,
    damage: 100,
    goldWin: [34, 48],
    xpWin: 42,
    xpLose: 14,
    unlocked: true,
    telegraphMs: 520,
    cooldownMs: 700,
  },
  {
    id: 'kai',
    name: 'Кай',
    title: 'Рубец',
    kind: 'gladiator',
    archetype: 'wall',
    skinId: 'kai',
    blurb: 'Стена: тяжёлые удары и щит, который иногда гасит твой выпад.',
    label: 'СОПЕРНИК · V',
    hp: 1550,
    damage: 130,
    goldWin: [42, 58],
    xpWin: 52,
    xpLose: 16,
    unlocked: true,
    telegraphMs: 640,
    cooldownMs: 780,
  },
  {
    id: 'oro',
    name: 'Оро',
    title: 'Глыба',
    kind: 'gladiator',
    archetype: 'brute',
    skinId: 'oro',
    blurb: 'Глыба с баклером: долгие тяжёлые замахи, клинч и слом стойки.',
    label: 'СОПЕРНИК · VI',
    hp: 2100,
    damage: 170,
    goldWin: [55, 78],
    xpWin: 68,
    xpLose: 20,
    unlocked: true,
    telegraphMs: 820,
    cooldownMs: 980,
  },
];

export function getOpponent(id: string): Opponent | undefined {
  return OPPONENTS.find((opponent) => opponent.id === id);
}

export function opponentDisplayName(opponent: Opponent): string {
  return `${opponent.name} «${opponent.title}»`;
}

export function isTrainingDummy(opponent: Opponent): boolean {
  return opponent.kind === 'training-dummy';
}

export function opponentSkin(opponent: Opponent) {
  return opponent.skinId ? ENEMY_SKINS[opponent.skinId] : undefined;
}

export function opponentCombat(opponent: Opponent): ArchetypeCombat {
  return ARCHETYPE_COMBAT[opponent.archetype];
}

export function opponentMechanics(opponent: Opponent): MechanicInfo[] {
  return mechanicsForIds(opponentCombat(opponent).mechanicIds);
}
