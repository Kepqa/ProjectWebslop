/** Пользовательские настройки (хранятся на устройстве). */
/** grim — мрачная перерисовка (по умолчанию включена), выключается в меню. */
export interface Settings { grim: boolean; lefty: boolean }

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('ss_settings') || 'null');
    if (s) return { grim: s.grim !== false, lefty: !!s.lefty };
  } catch { /* ignore */ }
  return { grim: true, lefty: false };
}

export const settings: Settings = load();

export function saveSettings() {
  try { localStorage.setItem('ss_settings', JSON.stringify(settings)); } catch { /* ignore */ }
}
