export type Levels = Record<string, number>;
export type Kind = 'swipe' | 'shape' | 'trinket';

export interface UpgradeDef {
  id: string;
  kind: Kind;
  icon: string;
  name: string;
  max: number;
  desc: (nextLevel: number) => string;
}

/** Слоты: свайп + формы свайпа делят 6 мест, тринкеты — 4. Заполнил — дальше только прокачка взятого. */
export const SLOTS = { blade: 6, trinket: 4 } as const;
export const slotOf = (k: Kind) => (k === 'trinket' ? 'trinket' : 'blade');

export interface SynergyDef { id: string; icon: string; name: string; a: string; b: string; desc: string }

/** Синергия включается, когда оба предмета прокачаны минимум до 2 уровня. */
export const SYN_LEVEL = 2;
export const SYNERGIES: SynergyDef[] = [
  { id: 'firewave', icon: '🌋', name: 'Огненная волна', a: 'wave', b: 'burn', desc: 'Волна оставляет горящий след' },
  { id: 'thunderspear', icon: '🌩️', name: 'Громовое копьё', a: 'spear', b: 'chain', desc: 'Каждое попадание копья бьёт молнией' },
  { id: 'twinboom', icon: '🪃', name: 'Парные бумеранги', a: 'boomerang', b: 'mirror', desc: 'Бумеранг летит ещё и в зеркальную сторону' },
  { id: 'cluster', icon: '🎆', name: 'Кассетные мины', a: 'mines', b: 'combo', desc: 'Мина разлетается тремя малыми взрывами' },
  { id: 'tornado', icon: '🌪️', name: 'Смерч', a: 'vortex', b: 'shove', desc: 'Вихрь живёт дольше и в конце разбрасывает зомби (в пропасть тоже)' },
  { id: 'iceshards', icon: '🧊', name: 'Ледяные осколки', a: 'shards', b: 'frost', desc: 'Осколки пронзают насквозь и почти замораживают' },
  { id: 'breach', icon: '🔨', name: 'Пробой', a: 'charge', b: 'momentum', desc: 'Заряженный свайп ×1.5 урона сверху и сразу ломает щиты' },
  { id: 'thirst', icon: '🍷', name: 'Жажда', a: 'bloodblade', b: 'rend', desc: 'Убийства кровотечением лечат 1 HP' },
  { id: 'doublerune', icon: '♾️', name: 'Двойная печать', a: 'rune', b: 'echo', desc: 'Печать повторяется через 0.5с' },
  { id: 'blackhole', icon: '🕳️', name: 'Чёрная дыра', a: 'censer', b: 'magnet', desc: 'Аура кадила затягивает зомби к вам' },
  { id: 'kaleido', icon: '🔷', name: 'Калейдоскоп', a: 'mirror', b: 'cross', desc: 'Взрывы креста +50% шире и сильнее' },
  { id: 'echocross', icon: '♻️', name: 'Эхо-перекрёсток', a: 'echo', b: 'cross', desc: 'Эхо-разрез взрывается на пересечениях со следами' },
  { id: 'echofire', icon: '🔥', name: 'Пламя эха', a: 'echo', b: 'burn', desc: 'Эхо-разрез тоже оставляет огненный след' },
  { id: 'mirrormines', icon: '🎇', name: 'Зеркальные мины', a: 'mirror', b: 'mines', desc: 'Двойник тоже роняет мины' },
  { id: 'funnel', icon: '🌀', name: 'Воронка', a: 'lasso', b: 'vortex', desc: 'Затянутая арканом петля оставляет в центре вихрь' },
  { id: 'deadeye', icon: '☠️', name: 'Приговор', a: 'mark', b: 'execute', desc: 'Меченого клинок казнит с одного удара (кроме боссов)' },
  { id: 'bowling', icon: '🎳', name: 'Страйк', a: 'barrel', b: 'pins', desc: 'Пнутая бочка катится, сбивая всех, и взрывается вдвое мощнее' },
  { id: 'epidemic', icon: '☣️', name: 'Эпидемия', a: 'plague', b: 'rend', desc: 'Кровотечение заражает чумой, заражённые лопаются облаком' },
  { id: 'timebreak', icon: '🕰️', name: 'Сломанные часы', a: 'chronos', b: 'rhythm', desc: 'Пока идёт Хронос — каждый свайп в такт' },
  { id: 'brittlehook', icon: '🪝', name: 'Сшибка', a: 'hook', b: 'crack', desc: 'Стянутые крюком зомби получают трещину при столкновении' },
];

export function activeSynergies(l: Levels) {
  return SYNERGIES.filter((s) => (l[s.a] ?? 0) >= SYN_LEVEL && (l[s.b] ?? 0) >= SYN_LEVEL);
}
export function synergiesOf(id: string) { return SYNERGIES.filter((s) => s.a === id || s.b === id); }

export interface Stats {
  bladeDamage: number; bladeWidth: number; energyMax: number; energyRegen: number; costMul: number;
  burnDur: number; burnDps: number; chainChance: number; chainJumps: number; chainDmg: number;
  comboThreshold: number; comboDmg: number; comboRadius: number; echoMul: number; frostDur: number; frostSlow: number;
  runeMult: number; runeCd: number; auraRadius: number; auraDps: number; bones: number; boneDmg: number;
  pickupRadius: number; healEvery: number; xpMul: number; speedMul: number; maxHp: number;
  momentum: number; bleedDps: number; knockMul: number; wallSlam: number; crossDmg: number; crossR: number;
  boomDmg: number; boomCd: number; bloodEnergy: number; reflectDmg: number; phoenix: number;
  grenadeCd: number; grenadeDmg: number; grenadeR: number; bell: number;
  // формы свайпа
  spearDmg: number; spearCount: number;
  waveDmg: number; waveScale: number;
  mirrorMul: number;
  shardCount: number; shardDmg: number;
  mineDmg: number; mineR: number; mineEvery: number;
  vortexR: number; vortexDps: number; vortexDur: number;
  chargeMul: number;
  comboTime: number; frenzyDmg: number; finisher: number;
  // необычные механики
  hookPull: number; execute: number; crackDmg: number; rhythmMul: number; pactDmg: number;
  parryMul: number; parryStun: number; pinsDmg: number; ballDmg: number; ballBounces: number;
  trapDmg: number; trapHold: number; lassoDmg: number; lassoStun: number; lassoCd: number;
  markCd: number; markGems: number; reaperEvery: number; reaperDmg: number; plagueDps: number; plagueSpread: number;
  greedDmg: number; greedR: number; chronoDur: number; chronoCd: number; repulseKnock: number; repulseDmg: number; contactMul: number;
  anchorMul: number; wardCd: number; totemCd: number; totemDur: number; totemDmg: number; barrelCd: number; barrelMul: number;
  syn: Record<string, boolean>;
}

const K = { s: 'swipe', f: 'shape', t: 'trinket' } as const;

export const UPGRADES: UpgradeDef[] = [
  // --- Свойства клинка ---
  { id: 'sharp', kind: K.s, icon: '🗡️', name: 'Заточка', max: 6, desc: () => '+1.5 к урону клинка-свайпа' },
  { id: 'wide', kind: K.s, icon: '〰️', name: 'Широкий взмах', max: 5, desc: () => 'След свайпа шире на 7px — проще задевать толпу' },
  { id: 'breath', kind: K.s, icon: '🫁', name: 'Второе дыхание', max: 5, desc: () => '+30 к макс. энергии и +10 к восстановлению в секунду' },
  { id: 'efficient', kind: K.s, icon: '🪶', name: 'Лёгкая рука', max: 5, desc: () => 'Свайпы и печати тратят на 15% меньше энергии' },
  { id: 'burn', kind: K.s, icon: '🔥', name: 'Огненный след', max: 5,
    desc: (l) => l === 1 ? 'След свайпа горит и жжёт зомби, которые по нему идут' : 'След горит дольше и жжёт сильнее' },
  { id: 'chain', kind: K.s, icon: '⚡', name: 'Цепная молния', max: 4,
    desc: (l) => l === 1 ? 'Убийство свайпом с шансом 30% бьёт молнией соседа' : '+30% к шансу и +1 прыжок молнии' },
  { id: 'combo', kind: K.s, icon: '💥', name: 'Комбо-взрыв', max: 4,
    desc: (l) => l === 1 ? 'Каждые 6 убийств одним свайпом — взрыв' : 'Взрыв нужен на 1 убийство раньше, мощнее и шире' },
  { id: 'echo', kind: K.s, icon: '👻', name: 'Эхо-разрез', max: 4,
    desc: (l) => l === 1 ? 'Через 0.3с призрачный клинок повторяет ваш свайп (55% урона)' : '+20% урона эха' },
  { id: 'frost', kind: K.s, icon: '❄️', name: 'Ледяная кромка', max: 4, desc: () => 'Задетые зомби замедляются сильнее и дольше' },
  { id: 'rune', kind: K.s, icon: '🔮', name: 'Печать круга', max: 4,
    desc: (l) => l === 1 ? 'Открывает печать: обведи зомби замкнутым кругом — урон всем внутри (перезарядка 3с)' : '+50% урона печати, перезарядка на 0.4с короче' },
  { id: 'momentum', kind: K.s, icon: '💨', name: 'Инерция', max: 4, desc: () => 'Чем резче свайп, тем больнее: до +30% урона за уровень' },
  { id: 'rend', kind: K.s, icon: '🩸', name: 'Рваные раны', max: 4,
    desc: (l) => l === 1 ? 'Задетые зомби кровоточат 3с (урон со временем)' : 'Кровотечение сильнее' },
  { id: 'shove', kind: K.s, icon: '🥊', name: 'Толчок', max: 4,
    desc: (l) => l === 1 ? 'Свайп отбрасывает сильнее; удар о стену ранит. В пропасть — насовсем' : 'Сильнее отброс и удар о стену' },
  { id: 'cross', kind: K.s, icon: '✖️', name: 'Крест-накрест', max: 4,
    desc: (l) => l === 1 ? 'Пересеки свой свежий след другим свайпом — в точке пересечения взрыв' : 'Взрыв пересечения мощнее и шире' },
  { id: 'boomerang', kind: K.s, icon: '🪃', name: 'Бумеранг', max: 4,
    desc: (l) => l === 1 ? 'Длинный свайп запускает вращающийся клинок туда и обратно' : 'Бумеранг бьёт сильнее и чаще' },
  { id: 'bloodblade', kind: K.s, icon: '🧛', name: 'Кровопийца', max: 3, desc: () => 'Каждое убийство свайпом возвращает 1.5 энергии' },
  { id: 'reflect', kind: K.s, icon: '🪞', name: 'Отражатель', max: 3,
    desc: (l) => l === 1 ? 'Разрубленные плевки и сферы летят обратно во врагов' : 'Отражённые снаряды бьют сильнее' },

  // --- Формы свайпа ---
  { id: 'spear', kind: K.f, icon: '🔱', name: 'Копьё', max: 4,
    desc: (l) => l === 1 ? 'В конце свайпа по его направлению летит копьё, пронзающее всех на пути' : l === 3 ? 'Два копья веером, больше урона' : 'Копьё бьёт сильнее' },
  { id: 'wave', kind: K.f, icon: '🌊', name: 'Волна', max: 4,
    desc: (l) => l === 1 ? 'Нарисованный след расходится волной своей же формы (раз в 1.4с)' : 'Волна шире и сильнее' },
  { id: 'mirror', kind: K.f, icon: '🦋', name: 'Двойник', max: 4,
    desc: (l) => l === 1 ? 'Свайп отражается зеркально через героя (55% урона)' : '+15% урона отражения' },
  { id: 'shards', kind: K.f, icon: '✴️', name: 'Веер осколков', max: 4,
    desc: (l) => `Конец свайпа выстреливает веер из ${2 + l} осколков` },
  { id: 'mines', kind: K.f, icon: '⭐', name: 'Звёздные мины', max: 4,
    desc: (l) => l === 1 ? 'Длинный след роняет звёзды-мины, они взрываются через 0.6с' : 'Мины чаще и мощнее' },
  { id: 'vortex', kind: K.f, icon: '🌀', name: 'Вихрь', max: 4,
    desc: (l) => l === 1 ? 'Резкий разворот свайпа (V или Z) создаёт вихрь, затягивающий зомби' : 'Вихрь шире и злее' },
  { id: 'frenzy', kind: K.s, icon: '🎰', name: 'Азарт', max: 3,
    desc: () => 'Бонус урона от комбо сильнее, каждое убийство в серии возвращает энергию' },
  { id: 'charge', kind: K.f, icon: '🎯', name: 'Заряд', max: 4,
    desc: (l) => l === 1 ? 'Задержи палец на месте 0.5с, затем режь: свайп ×2 урона и шире' : '+0.4 к множителю заряда' },

  { id: 'hook', kind: K.s, icon: '🪝', name: 'Крюк', max: 3,
    desc: (l) => l === 1 ? 'Отпустил палец — все задетые свайпом зомби рывком стягиваются к концу следа и бьются лбами' : 'Рывок сильнее, удар при столкновении больнее' },
  { id: 'execute', kind: K.s, icon: '🪓', name: 'Казнь', max: 3, desc: (l) => `Клинок мгновенно добивает зомби с HP ниже ${12 + 6 * l}% (+1 энергия)` },
  { id: 'crack', kind: K.s, icon: '💎', name: 'Трещина', max: 4,
    desc: (l) => l === 1 ? 'Каждый удар клинком — трещина. Третья раскалывает зомби, осколки ранят соседей' : 'Осколки больнее и разлетаются шире' },
  { id: 'rhythm', kind: K.s, icon: '🥁', name: 'Ритм', max: 3,
    desc: (l) => l === 1 ? 'Начинай свайпы ровно, раз в 0.35–0.9с: каждый 3-й в такт режет ×1.9 и шире' : 'Свайп в такт ещё сильнее' },
  { id: 'pact', kind: K.s, icon: '🩸', name: 'Кровавый пакт', max: 3,
    desc: (l) => l === 1 ? 'Без энергии свайп режет за счёт здоровья. Пока HP ниже половины — +25% урона клинка' : '+25% урона при HP ниже половины' },
  { id: 'parry', kind: K.s, icon: '🛡️', name: 'Контрудар', max: 3,
    desc: (l) => l === 1 ? 'Удар по зомби в замахе, рывке, заряде прыжка или с зажжённым фитилём — ×2.5 урона и оглушение' : 'Сильнее и дольше оглушает' },
  { id: 'pins', kind: K.s, icon: '🎳', name: 'Кегли', max: 4,
    desc: (l) => l === 1 ? 'Отброшенные зомби — живые снаряды: ранят всех, в кого врезаются, и сбивают их цепочкой' : 'Удар кеглей сильнее, отброс дальше' },
  { id: 'ricochet', kind: K.f, icon: '🎱', name: 'Рикошет', max: 4,
    desc: (l) => l === 1 ? 'Конец свайпа запускает шар, который отскакивает от стен 3 раза' : '+1 отскок, больше урона' },
  { id: 'trap', kind: K.f, icon: '🪤', name: 'Капкан', max: 3,
    desc: (l) => l === 1 ? 'Начало длинного свайпа ставит капкан: первый наступивший зомби схвачен, соседей тянет к нему' : 'Держит дольше, ранит сильнее' },
  { id: 'lasso', kind: K.f, icon: '➰', name: 'Аркан', max: 3,
    desc: (l) => l === 1 ? 'Обведи толпу петлёй — все внутри стягиваются в узел и оглушаются (без затрат энергии)' : 'Чаще, больнее, дольше оглушает' },

  // --- Тринкеты ---
  { id: 'censer', kind: K.t, icon: '🏮', name: 'Гнилое кадило', max: 5, desc: (l) => l === 1 ? 'Широкая аура вокруг вас жжёт зомби' : 'Аура шире и сильнее' },
  { id: 'bones', kind: K.t, icon: '🦴', name: 'Хоровод костей', max: 5, desc: (l) => l === 1 ? 'Вокруг вас кружит кость и бьёт зомби' : '+1 кость, больше урона' },
  { id: 'magnet', kind: K.t, icon: '🧲', name: 'Ржавый магнит', max: 4, desc: () => 'Опыт и аптечки притягиваются на 50% дальше' },
  { id: 'tooth', kind: K.t, icon: '🦷', name: 'Клык вампира', max: 4, desc: (l) => `Лечит 4 HP за каждые ${Math.max(10, 30 - 5 * l)} убийств` },
  { id: 'coin', kind: K.t, icon: '🪙', name: 'Счастливая монета', max: 4, desc: () => '+25% опыта и чаще аптечки в ящиках' },
  { id: 'boots', kind: K.t, icon: '👟', name: 'Кеды беглеца', max: 4, desc: () => '+12% к скорости бега' },
  { id: 'heart', kind: K.t, icon: '❤️', name: 'Запасное сердце', max: 4, desc: () => '+25 к макс. HP и столько же лечения' },
  { id: 'phoenix', kind: K.t, icon: '🪶', name: 'Перо феникса', max: 1, desc: () => 'Один раз за забег воскрешает с 50% HP и взрывом' },
  { id: 'grenade', kind: K.t, icon: '💣', name: 'Ржавая граната', max: 4, desc: (l) => l === 1 ? 'Раз в 5с бросает гранату в ближайшую толпу' : 'Гранаты чаще и мощнее' },
  { id: 'metronome', kind: K.t, icon: '⏱️', name: 'Метроном', max: 3, desc: () => 'Серия комбо держится на 0.6с дольше' },
  { id: 'finisher', kind: K.t, icon: '🧨', name: 'Финишер', max: 3, desc: () => 'Конец серии от 10 убийств взрывается вокруг вас (урон растёт с серией)' },
  { id: 'mark', kind: K.t, icon: '🎯', name: 'Метка охотника', max: 3,
    desc: (l) => l === 1 ? 'Раз в 6с метит самого крепкого зомби рядом. Его смерть — взрыв и россыпь опыта' : 'Метка чаще, добыча богаче' },
  { id: 'reaper', kind: K.t, icon: '💀', name: 'Жнец', max: 4, desc: (l) => `Каждое ${Math.max(5, 12 - 2 * l)}-е убийство выпускает душу — она сама ищет цель и пронзает` },
  { id: 'plague', kind: K.t, icon: '🦠', name: 'Чума', max: 4,
    desc: (l) => l === 1 ? 'Убитый зомби заражает соседа. Заражённый гниёт и, умирая, заражает дальше — эпидемия' : '+1 заражённый, гниль сильнее' },
  { id: 'greed', kind: K.t, icon: '💰', name: 'Жадность', max: 3, desc: (l) => l === 1 ? 'Подобранный опыт взрывается вокруг вас — собирай кристаллы в гуще толпы' : 'Взрывы от опыта шире и больнее' },
  { id: 'chronos', kind: K.t, icon: '⏳', name: 'Хронос', max: 3, desc: (l) => `Серия ×20 останавливает время для зомби почти на ${2 + l}с (раз в ${30 - 4 * l}с)` },
  { id: 'repulse', kind: K.t, icon: '🫧', name: 'Отталкивающее поле', max: 4,
    desc: () => 'Коснувшийся вас зомби отлетает кеглей и получает урон; урон от касаний −12%' },
  { id: 'anchor', kind: K.t, icon: '⚓', name: 'Якорь', max: 3, desc: () => 'Постой 0.6с — пустишь корни: +30% урона клинка, пока не сдвинешься' },
  { id: 'ward', kind: K.t, icon: '🪬', name: 'Оберег', max: 3, desc: (l) => `Раз в ${21 - 4 * l}с полностью гасит удар и отшвыривает всех вокруг` },
  { id: 'totem', kind: K.t, icon: '🗿', name: 'Тотем', max: 4, desc: (l) => l === 1 ? 'Раз в 10с ставит тотем, который бьёт молнией ближайших зомби' : 'Тотем чаще, дольше, сильнее' },
  { id: 'barrel', kind: K.t, icon: '🛢️', name: 'Бочкарь', max: 3,
    desc: (l) => l === 1 ? 'Раз в 10с рядом падает взрывная бочка. Все бочки взрываются на 40% мощнее' : 'Бочки чаще и мощнее' },
  { id: 'bell', kind: K.t, icon: '🔔', name: 'Колокол паники', max: 3, desc: () => 'HP ниже 35% и вас бьют — звон отбрасывает и ранит всех рядом (раз в 25с)' },
];

export const byId = (id: string) => UPGRADES.find((u) => u.id === id);

export function slotsUsed(l: Levels) {
  const used = { blade: 0, trinket: 0 };
  for (const u of UPGRADES) if ((l[u.id] ?? 0) > 0) used[slotOf(u.kind)]++;
  return used;
}

import { isUnlocked } from './achievements';

/** Что можно предложить: открыто, не на максимуме и (уже взято или есть свободный слот). */
export function offerPool(l: Levels, onlyKind?: Kind, unlocked: Set<string> | null = null) {
  const used = slotsUsed(l);
  return UPGRADES.filter((u) => {
    if (onlyKind && u.kind !== onlyKind) return false;
    if (!isUnlocked(u.id, unlocked)) return false;
    const lv = l[u.id] ?? 0;
    if (lv >= u.max) return false;
    return lv > 0 || used[slotOf(u.kind)] < SLOTS[slotOf(u.kind)];
  });
}

/** Три карточки: взвешенно, с приоритетом того, что даст синергию. */
export function rollChoices(l: Levels, unlocked: Set<string> | null = null, n = 3): UpgradeDef[] {
  const pool = offerPool(l, undefined, unlocked);
  const out: UpgradeDef[] = [];
  while (out.length < n && pool.length) {
    const w = pool.map((u) => {
      let k = u.kind === 'trinket' ? 1 : u.id === 'rune' ? 1.2 : 2.4;
      if ((l[u.id] ?? 0) > 0) k *= 1.6;
      // предмет, напарник по синергии которого уже взят, выпадает чаще
      if (synergiesOf(u.id).some((s) => (l[s.a === u.id ? s.b : s.a] ?? 0) > 0)) k *= 1.5;
      return k;
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    while ((r -= w[i]) > 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

import type { MetaBonus } from './meta';

export function computeStats(l: Levels, mb?: MetaBonus): Stats {
  const s = baseStats(l);
  if (!mb) return s;
  // постоянные бонусы из «Мастерской»
  s.maxHp += mb.hp; s.bladeDamage += mb.dmg; s.energyMax += mb.energy; s.energyRegen += mb.regen;
  s.xpMul *= 1 + mb.xp; s.pickupRadius *= 1 + mb.magnet; s.speedMul *= 1 + mb.speed; s.phoenix = Math.max(s.phoenix, mb.revive);
  return s;
}

function baseStats(l: Levels): Stats {
  const v = (id: string) => l[id] ?? 0;
  const syn: Record<string, boolean> = {};
  for (const s of activeSynergies(l)) syn[s.id] = true;
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
    runeMult: v('rune') ? 2 + 1 * (v('rune') - 1) : 0,
    runeCd: 3.4 - 0.4 * v('rune'),
    auraRadius: v('censer') ? 85 + 20 * v('censer') : 0,
    auraDps: 4 * v('censer'),
    bones: v('bones'),
    boneDmg: 4 + v('bones'),
    pickupRadius: 70 * (1 + 0.5 * v('magnet')),
    healEvery: v('tooth') ? Math.max(10, 30 - 5 * v('tooth')) : 0,
    xpMul: 1 + 0.25 * v('coin'),
    speedMul: 1 + 0.12 * v('boots'),
    maxHp: 100 + 25 * v('heart'),
    momentum: 0.3 * v('momentum'),
    bleedDps: 1.5 * v('rend'),
    knockMul: 1 + 0.6 * v('shove'),
    wallSlam: 4 * v('shove'),
    crossDmg: v('cross') ? 6 + 5 * v('cross') : 0,
    crossR: 70 + 12 * v('cross'),
    boomDmg: v('boomerang') ? 3 + 2 * v('boomerang') : 0,
    boomCd: 1.3 - 0.2 * v('boomerang'),
    bloodEnergy: 1.5 * v('bloodblade'),
    reflectDmg: v('reflect') ? 6 + 5 * v('reflect') : 0,
    phoenix: v('phoenix'),
    grenadeCd: v('grenade') ? 5.5 - 0.8 * v('grenade') : 0,
    grenadeDmg: 8 + 5 * v('grenade'),
    grenadeR: 80 + 12 * v('grenade'),
    bell: v('bell'),
    spearDmg: v('spear') ? 5 + 4 * v('spear') : 0,
    spearCount: v('spear') >= 3 ? 2 : 1,
    waveDmg: v('wave') ? 1 + 1.5 * v('wave') : 0,
    waveScale: 1.7 + 0.25 * v('wave'),
    mirrorMul: v('mirror') ? 0.4 + 0.15 * v('mirror') : 0,
    shardCount: v('shards') ? 2 + v('shards') : 0,
    shardDmg: 3 + 2 * v('shards'),
    mineDmg: v('mines') ? 5 + 4 * v('mines') : 0,
    mineR: 60 + 10 * v('mines'),
    mineEvery: 260 - 30 * v('mines'),
    vortexR: v('vortex') ? 90 + 18 * v('vortex') : 0,
    vortexDps: 3 * v('vortex'),
    vortexDur: 1.1 + 0.2 * v('vortex') + (syn.tornado ? 1 : 0),
    chargeMul: v('charge') ? 1.6 + 0.4 * v('charge') : 0,
    comboTime: 0.6 * v('metronome'), frenzyDmg: v('frenzy'), finisher: v('finisher'),
    hookPull: v('hook') ? 380 + 140 * v('hook') : 0,
    execute: v('execute') ? 0.12 + 0.06 * v('execute') : 0,
    crackDmg: v('crack') ? 0.25 + 0.1 * v('crack') : 0,
    rhythmMul: v('rhythm') ? 1.5 + 0.4 * v('rhythm') : 0,
    pactDmg: 0.25 * v('pact'),
    parryMul: v('parry') ? 2 + 0.5 * v('parry') : 0, parryStun: 1 + 0.4 * v('parry'),
    pinsDmg: v('pins') ? 3 + 2.5 * v('pins') : 0,
    ballDmg: v('ricochet') ? 4 + 3 * v('ricochet') : 0, ballBounces: 2 + v('ricochet'),
    trapDmg: v('trap') ? 6 + 5 * v('trap') : 0, trapHold: 2 + 0.6 * v('trap'),
    lassoDmg: v('lasso') ? 3 + 3 * v('lasso') : 0, lassoStun: 0.8 + 0.4 * v('lasso'), lassoCd: 4.6 - 0.6 * v('lasso'),
    markCd: v('mark') ? 7 - v('mark') : 0, markGems: 3 + v('mark'),
    reaperEvery: v('reaper') ? Math.max(5, 12 - 2 * v('reaper')) : 0, reaperDmg: 6 + 4 * v('reaper'),
    plagueDps: v('plague') ? 2 + 1.5 * v('plague') : 0, plagueSpread: v('plague'),
    greedDmg: v('greed') ? 3 + 3 * v('greed') : 0, greedR: 60 + 18 * v('greed'),
    chronoDur: v('chronos') ? 2 + v('chronos') : 0, chronoCd: 30 - 4 * v('chronos'),
    repulseKnock: v('repulse') ? 380 + 80 * v('repulse') : 0, repulseDmg: 2 + 2 * v('repulse'), contactMul: Math.max(0.4, 1 - 0.12 * v('repulse')),
    anchorMul: 0.3 * v('anchor'),
    wardCd: v('ward') ? 21 - 4 * v('ward') : 0,
    totemCd: v('totem') ? 11 - v('totem') : 0, totemDur: 5 + v('totem'), totemDmg: 4 + 3 * v('totem'),
    barrelCd: v('barrel') ? 12 - 2 * v('barrel') : 0, barrelMul: 1 + 0.4 * v('barrel'),
    syn,
  };
}
