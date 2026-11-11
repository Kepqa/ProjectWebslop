/** Пользовательские настройки (хранятся на устройстве). */
/** grim — мрачная перерисовка (по умолчанию включена), выключается в меню. */
export interface Settings { grim: boolean; lefty: boolean; particles: boolean; haptics: boolean }

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('ss_settings') || 'null');
    if (s) return { grim: s.grim !== false, lefty: !!s.lefty, particles: s.particles !== false, haptics: s.haptics !== false };
  } catch { /* ignore */ }
  return { grim: true, lefty: false, particles: true, haptics: true };
}

export const settings: Settings = load();

export function saveSettings() {
  try { localStorage.setItem('ss_settings', JSON.stringify(settings)); } catch { /* ignore */ }
}
