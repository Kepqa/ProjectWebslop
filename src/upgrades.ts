export type Levels = Record<string, number>;

export interface UpgradeDef {
  id: string;
  kind: 'swipe' | 'trinket';
  icon: string;
  name: string;
  max: number;
  desc: (nextLevel: number) => string;
}

export interface Stats {
  bladeDamage: number;
  bladeWidth: number;
  energyMax: number;
  energyRegen: number;
  costMul: number;
  burnDur: number;
  burnDps: number;
  chainChance: number;
  chainJumps: number;
  chainDmg: number;
  comboThreshold: number;
  comboDmg: number;
  comboRadius: number;
  echoMul: number;
  frostDur: number;
  frostSlow: number;
  runeMult: number;
  auraRadius: number;
  auraDps: number;
  bones: number;
  boneDmg: number;
  pickupRadius: number;
  healEvery: number;
  xpMul: number;
  speedMul: number;
  maxHp: number;
}

export const UPGRADES: UpgradeDef[] = [
  // --- Апгрейды свайпа ---
  { id: 'sharp', kind: 'swipe', icon: '🗡️', name: 'Заточка', max: 6,
    desc: () => '+1.5 к урону клинка-свайпа' },
  { id: 'wide', kind: 'swipe', icon: '〰️', name: 'Широкий взмах', max: 5,
    desc: () => 'След свайпа шире на 7px — проще задевать толпу' },
  { id: 'breath', kind: 'swipe', icon: '🫁', name: 'Второе дыхание', max: 5,
    desc: () => '+30 к макс. энергии и +10 к восстановлению в секунду' },
  { id: 'efficient', kind: 'swipe', icon: '🪶', name: 'Лёгкая рука', max: 5,
    desc: () => 'Свайпы и печати тратят на 15% меньше энергии' },
  { id: 'burn', kind: 'swipe', icon: '🔥', name: 'Огненный след', max: 5,
    desc: (l) => l === 1 ? 'След свайпа горит и жжёт зомби, которые по нему идут'
      : 'След горит дольше и жжёт сильнее' },
  { id: 'chain', kind: 'swipe', icon: '⚡', name: 'Цепная молния', max: 4,
    desc: (l) => l === 1 ? 'Убийство свайпом с шансом 30% бьёт молнией соседа'
      : '+30% к шансу и +1 прыжок молнии' },
  { id: 'combo', kind: 'swipe', icon: '💥', name: 'Комбо-взрыв', max: 4,
    desc: (l) => l === 1 ? 'Каждые 6 убийств одним свайпом — взрыв'
      : 'Взрыв нужен на 1 убийство раньше, мощнее и шире' },
  { id: 'echo', kind: 'swipe', icon: '👻', name: 'Эхо-разрез', max: 4,
    desc: (l) => l === 1 ? 'Через 0.3с призрачный клинок повторяет ваш свайп (55% урона)'
      : '+20% урона эха' },
  { id: 'frost', kind: 'swipe', icon: '❄️', name: 'Ледяная кромка', max: 4,
    desc: () => 'Задетые свайпом и печатью зомби замедляются сильнее и дольше' },
  { id: 'rune', kind: 'swipe', icon: '🔮', name: 'Мастер печатей', max: 5,
    desc: () => 'Обведи зомби кругом: урон печати +150%' },

  // --- Тринкеты ---
  { id: 'censer', kind: 'trinket', icon: '🏮', name: 'Гнилое кадило', max: 5,
    desc: (l) => l === 1 ? 'Аура вокруг вас жжёт ближайших зомби' : 'Аура шире и сильнее' },
  { id: 'bones', kind: 'trinket', icon: '🦴', name: 'Хоровод костей', max: 5,
    desc: (l) => l === 1 ? 'Вокруг вас кружит кость и бьёт зомби' : '+1 кость, больше урона' },
  { id: 'magnet', kind: 'trinket', icon: '🧲', name: 'Ржавый магнит', max: 4,
    desc: () => 'Опыт притягивается с расстояния на 50% больше' },
  { id: 'tooth', kind: 'trinket', icon: '🦷', name: 'Клык вампира', max: 4,
    desc: (l) => `Лечит 4 HP за каждые ${Math.max(10, 30 - 5 * l)} убийств` },
  { id: 'coin', kind: 'trinket', icon: '🪙', name: 'Счастливая монета', max: 4,
    desc: () => '+25% получаемого опыта' },
  { id: 'boots', kind: 'trinket', icon: '👟', name: 'Кеды беглеца', max: 4,
    desc: () => '+12% к скорости бега' },
  { id: 'heart', kind: 'trinket', icon: '❤️', name: 'Запасное сердце', max: 4,
    desc: () => '+25 к макс. HP и столько же лечения' },
];

export function computeStats(l: Levels): Stats {
  const v = (id: string) => l[id] ?? 0;
  return {
    bladeDamage: 4 + 1.5 * v('sharp'),
    bladeWidth: 18 + 7 * v('wide'),
    energyMax: 100 + 30 * v('breath'),
    energyRegen: 28 + 10 * v('breath'),
    costMul: Math.pow(0.85, v('efficient')),
    burnDur: v('burn') ? 1 + 0.5 * v('burn') : 0,
    burnDps: 3 * v('burn'),
    chainChance: Math.min(1, 0.3 * v('chain')),
    chainJumps: v('chain'),
    chainDmg: 2 + v('chain'),
    comboThreshold: v('combo') ? Math.max(3, 7 - v('combo')) : Infinity,
    comboDmg: 4 + 3 * v('combo'),
    comboRadius: 90 + 20 * v('combo'),
    echoMul: v('echo') ? 0.35 + 0.2 * v('echo') : 0,
    frostDur: 0.8 + 0.5 * v('frost'),
    frostSlow: Math.max(0.2, 0.75 - 0.13 * v('frost')),
    runeMult: 3 * (1 + 1.5 * v('rune')),
    auraRadius: v('censer') ? 60 + 15 * v('censer') : 0,
    auraDps: 3 * v('censer'),
    bones: v('bones'),
    boneDmg: 4 + v('bones'),
    pickupRadius: 70 * (1 + 0.5 * v('magnet')),
    healEvery: v('tooth') ? Math.max(10, 30 - 5 * v('tooth')) : 0,
    xpMul: 1 + 0.25 * v('coin'),
    speedMul: 1 + 0.12 * v('boots'),
    maxHp: 100 + 25 * v('heart'),
  };
}
