/**
 * Анонимная статистика: сколько устройств открыло игру и сколько забегов сыграно.
 * Счётчики хранятся в бесплатном сервисе Abacus (без регистрации). Отправляется только «+1»,
 * без каких-либо данных об игроке. Уникальность — по устройству (флаг в localStorage).
 * Локальная разработка и режим разработчика не считаются.
 */
const BASE = 'https://abacus.jasoncameron.dev';
const NS = 'swipesurv-q7m2x9';

function skip() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || isDev();
}

export function isDev() {
  try { return localStorage.getItem('ss_dev') === '1'; } catch { return false; }
}

function hit(key: string) {
  return fetch(`${BASE}/hit/${NS}/${key}`, { mode: 'cors', cache: 'no-store' });
}

/** Один раз на устройство: +1 уникальный игрок. */
export function trackVisit() {
  if (skip()) return;
  try { if (localStorage.getItem('ss_counted')) return; } catch { return; }
  hit('users').then((r) => { if (r.ok) localStorage.setItem('ss_counted', '1'); }).catch(() => undefined);
}

/** Каждый начатый забег (соло/кооп). */
export function trackRun(kind: 'solo' | 'coop') {
  if (skip()) return;
  void hit('runs').catch(() => undefined);
  if (kind === 'coop') void hit('coop').catch(() => undefined);
}

export async function fetchStats(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  await Promise.all(['users', 'runs', 'coop'].map(async (k) => {
    try {
      const r = await fetch(`${BASE}/get/${NS}/${k}`, { cache: 'no-store' });
      out[k] = r.ok ? ((await r.json()) as { value: number }).value : r.status === 404 ? 0 : null;
    } catch { out[k] = null; }
  }));
  return out;
}
