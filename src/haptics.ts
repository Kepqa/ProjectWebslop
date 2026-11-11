import { settings } from './settings';

/**
 * Лёгкая вибрация. Работает там, где браузер умеет navigator.vibrate (Android, Chrome);
 * в Safari на iPhone/iPad этого API нет — там тихо ничего не происходит.
 * Импульсы короткие и с ограничением частоты, чтобы телефон не «жужжал» в толпе.
 */
const PATTERNS = {
  cut: 7,                 // убийство клинком
  multi: 14,              // серия от трёх за взмах
  heavy: 22,              // крупный враг, взрыв рядом
  dull: 5,                // клинок затупился
  hurt: [28, 30, 18],     // по герою попали
  level: [10, 45, 16],    // новый уровень
  chest: [8, 60, 30],     // сундук открылся
  boss: [30, 50, 30, 50, 60],
  pick: 6,                // выбор карточки, сбор петлёй
} satisfies Record<string, number | number[]>;
export type Haptic = keyof typeof PATTERNS;

/** Минимальная пауза между импульсами одного вида, мс. */
const GAP: Partial<Record<Haptic, number>> = { cut: 70, multi: 120, heavy: 160, pick: 90, dull: 250 };
const last: Partial<Record<Haptic, number>> = {};

export const hapticsSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function haptic(kind: Haptic) {
  if (!settings.haptics || !hapticsSupported()) return;
  const now = performance.now();
  if (now - (last[kind] ?? -1e9) < (GAP[kind] ?? 0)) return;
  last[kind] = now;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}
