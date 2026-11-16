import { isDev } from './stats';

/**
 * Флаги функций. «Заморожено» — спрятано из интерфейса; код, сохранения и прогресс остаются.
 *  - story — режим «Сюжет» (4 главы);
 *  - coop  — сетевой кооп.
 * Включить на этом устройстве: открыть игру с ?features=story,coop (запоминается), ?features=all — всё,
 * ?features=none — вернуть по умолчанию. Режим разработчика показывает всё.
 */
export type Feature = 'story' | 'coop';
const ALL: Feature[] = ['story', 'coop'];
const KEY = 'ss_features';

function parse(v: string | null): Feature[] {
  if (!v || v === 'none') return [];
  if (v === 'all') return ALL.slice();
  return v.split(',').map((s) => s.trim()).filter((s): s is Feature => (ALL as string[]).includes(s));
}

function load(): Set<Feature> {
  try {
    const q = new URLSearchParams(location.search).get('features');
    if (q !== null) {
      const on = parse(q);
      if (on.length) localStorage.setItem(KEY, on.join(',')); else localStorage.removeItem(KEY);
      return new Set(on);
    }
    return new Set(parse(localStorage.getItem(KEY)));
  } catch { return new Set(); }
}

const enabled = load();

/** Включена ли функция (false — заморожена). */
export function featureOn(f: Feature): boolean {
  return isDev() || enabled.has(f);
}
