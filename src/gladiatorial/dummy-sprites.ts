import woodUrl from './assets/enemies/stolb-wood.png';
import metalUrl from './assets/enemies/stolb-metal.png';

export type DummySpriteId = 'wood' | 'metal';

export interface DummySprite {
  id: DummySpriteId;
  textureKey: string;
  url: string;
  /** Высота спрайта на арене (px). */
  displayHeight: number;
}

export const DUMMY_SPRITES: Record<DummySpriteId, DummySprite> = {
  wood: {
    id: 'wood',
    textureKey: 'dummy-wood',
    url: woodUrl,
    displayHeight: 159,
  },
  metal: {
    id: 'metal',
    textureKey: 'dummy-metal',
    url: metalUrl,
    displayHeight: 159,
  },
};
