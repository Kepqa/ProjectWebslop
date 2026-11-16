export type StatName = 'strength' | 'vitality' | 'weapon';
export type SkinName = 'bronze' | 'ember' | 'azure';

export interface PlayerProfile {
  username: string;
  level: number;
  xp: number;
  gold: number;
  strength: number;
  vitality: number;
  weapon: number;
  skin: SkinName;
  unlockedSkins: SkinName[];
  boxes: number;
  subscriptionUntil: number;
  developer: boolean;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  username: 'Боец арены',
  level: 1,
  xp: 0,
  gold: 120,
  strength: 10,
  vitality: 100,
  weapon: 1,
  skin: 'bronze',
  unlockedSkins: ['bronze'],
  boxes: 0,
  subscriptionUntil: 0,
  developer: false,
};

export const STORAGE_KEY = 'gladiators.profile.v1';
