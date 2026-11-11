/** Версия сборки и проверка обновлений. */
export const VERSION = __APP_VERSION__;
export const BUILD = __APP_BUILD__;
export const BUILD_DATE = __APP_DATE__;

/** Узнаёт, есть ли на сервере сборка новее открытой. */
export async function checkUpdate(): Promise<string | null> {
  try {
    const r = await fetch(`../version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const v = (await r.json()) as { build: string; version: string };
    return v.build && v.build !== BUILD ? v.version : null;
  } catch { return null; }
}
