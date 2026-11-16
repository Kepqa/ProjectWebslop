import linHead from './assets/enemies/азиат_x0.8/голова.png';
import linLeftThigh from './assets/enemies/азиат_x0.8/лево_бедро.png';
import linLeftShin from './assets/enemies/азиат_x0.8/лево_голень.png';
import linLeftFist from './assets/enemies/азиат_x0.8/лево_кулак_меч.png';
import linLeftShoulder from './assets/enemies/азиат_x0.8/лево_плечо.png';
import linLeftForearm from './assets/enemies/азиат_x0.8/лево_предплечЬе.png';
import linRightFist from './assets/enemies/азиат_x0.8/право_кулак.png';
import linRightThigh from './assets/enemies/азиат_x0.8/право_бедро.png';
import linRightShin from './assets/enemies/азиат_x0.8/право_голень.png';
import linRightShoulder from './assets/enemies/азиат_x0.8/право_плечо.png';
import linRightForearm from './assets/enemies/азиат_x0.8/предплечъе_левое.png';
import linBody from './assets/enemies/азиат_x0.8/тело.png';

import kaiHead from './assets/enemies/новый_боец/голова.png';
import kaiLeftThigh from './assets/enemies/новый_боец/лево_бедро.png';
import kaiLeftShin from './assets/enemies/новый_боец/лево_голень.png';
import kaiLeftFist from './assets/enemies/новый_боец/лево_кулак_меч.png';
import kaiLeftShoulder from './assets/enemies/новый_боец/лево_плечо.png';
import kaiLeftForearm from './assets/enemies/новый_боец/лево_предплечЬе.png';
import kaiRightFist from './assets/enemies/новый_боец/право_кулак.png';
import kaiRightThigh from './assets/enemies/новый_боец/право_бедро.png';
import kaiRightShin from './assets/enemies/новый_боец/право_голень.png';
import kaiRightShoulder from './assets/enemies/новый_боец/право_плечо.png';
import kaiRightForearm from './assets/enemies/новый_боец/предплечъе_левое.png';
import kaiBody from './assets/enemies/новый_боец/тело.png';

import oroHead from './assets/enemies/афроамериканец_x1.3/голова.png';
import oroLeftThigh from './assets/enemies/афроамериканец_x1.3/лево_бедро.png';
import oroLeftShin from './assets/enemies/афроамериканец_x1.3/лево_голень.png';
import oroLeftFist from './assets/enemies/афроамериканец_x1.3/лево_кулак_меч.png';
import oroLeftShoulder from './assets/enemies/афроамериканец_x1.3/лево_плечо.png';
import oroLeftForearm from './assets/enemies/афроамериканец_x1.3/лево_предплечЬе.png';
import oroRightFist from './assets/enemies/афроамериканец_x1.3/право_кулак.png';
import oroRightThigh from './assets/enemies/афроамериканец_x1.3/право_бедро.png';
import oroRightShin from './assets/enemies/афроамериканец_x1.3/право_голень.png';
import oroRightShoulder from './assets/enemies/афроамериканец_x1.3/право_плечо.png';
import oroRightForearm from './assets/enemies/афроамериканец_x1.3/предплечъе_левое.png';
import oroBody from './assets/enemies/афроамериканец_x1.3/тело.png';

export type EnemySkinId = 'lin' | 'kai' | 'oro';

export type EnemySkin = {
  id: EnemySkinId;
  /**
   * Визуальный размер на арене (принты уже нормализуются под скелет).
   * Не дублировать коэффициент из имени папки (x0.8 / x1.3) — он в самих PNG.
   */
  scaleMul: number;
  parts: Record<string, string>;
};

function pack(
  head: string,
  body: string,
  leftShoulder: string,
  leftForearm: string,
  leftFist: string,
  leftThigh: string,
  leftShin: string,
  rightShoulder: string,
  rightForearm: string,
  rightFist: string,
  rightThigh: string,
  rightShin: string,
): Record<string, string> {
  return {
    голова: head,
    тело: body,
    лево_плечо: leftShoulder,
    лево_предплечЬе: leftForearm,
    лево_кулак_меч: leftFist,
    лево_бедро: leftThigh,
    лево_голень: leftShin,
    право_плечо: rightShoulder,
    'предплечъе левое': rightForearm,
    'право кулак': rightFist,
    право_бедро: rightThigh,
    право_голень: rightShin,
  };
}

export const ENEMY_SKINS: Record<EnemySkinId, EnemySkin> = {
  lin: {
    id: 'lin',
    scaleMul: 0.92,
    parts: pack(
      linHead, linBody,
      linLeftShoulder, linLeftForearm, linLeftFist, linLeftThigh, linLeftShin,
      linRightShoulder, linRightForearm, linRightFist, linRightThigh, linRightShin,
    ),
  },
  kai: {
    id: 'kai',
    scaleMul: 1,
    parts: pack(
      kaiHead, kaiBody,
      kaiLeftShoulder, kaiLeftForearm, kaiLeftFist, kaiLeftThigh, kaiLeftShin,
      kaiRightShoulder, kaiRightForearm, kaiRightFist, kaiRightThigh, kaiRightShin,
    ),
  },
  oro: {
    id: 'oro',
    scaleMul: 1.06,
    parts: pack(
      oroHead, oroBody,
      oroLeftShoulder, oroLeftForearm, oroLeftFist, oroLeftThigh, oroLeftShin,
      oroRightShoulder, oroRightForearm, oroRightFist, oroRightThigh, oroRightShin,
    ),
  },
};
