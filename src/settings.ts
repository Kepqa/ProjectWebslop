/** Пользовательские настройки (хранятся на устройстве). */
export interface Settings { gloomy: boolean; lefty: boolean }

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('ss_settings') || 'null');
    if (s) return { gloomy: !!s.gloomy, lefty: !!s.lefty };
  } catch { /* ignore */ }
  return { gloomy: false, lefty: false };
}

export const settings: Settings = load();

export function saveSettings() {
  try { localStorage.setItem('ss_settings', JSON.stringify(settings)); } catch { /* ignore */ }
}
