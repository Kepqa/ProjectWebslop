import type { PlayerProfile, SkinName } from './types';

export const SUBSCRIPTION_STARS = 150;
export const BOX_STARS = 25;
const SUBSCRIPTION_MS = 30 * 24 * 60 * 60 * 1000;
const REWARDED_AD_MS = 4_000;

const subscriptionLink = import.meta.env.VITE_STARS_SUBSCRIPTION_LINK ?? '';
const boxLink = import.meta.env.VITE_STARS_BOX_LINK ?? '';

export function developerToolsEnabled(): boolean {
  return import.meta.env.DEV;
}

export function subscriptionActive(profile: PlayerProfile): boolean {
  return profile.subscriptionUntil > Date.now();
}

export function grantDeveloperResources(profile: PlayerProfile): void {
  profile.developer = true;
  profile.gold = Math.max(profile.gold, 99_999);
  profile.boxes = Math.max(profile.boxes, 20);
  profile.subscriptionUntil = Date.now() + SUBSCRIPTION_MS;
  profile.unlockedSkins = ['bronze', 'ember', 'azure'];
}

export async function purchaseSubscription(profile: PlayerProfile): Promise<string> {
  if (developerToolsEnabled() && profile.developer) {
    profile.subscriptionUntil = Date.now() + SUBSCRIPTION_MS;
    profile.boxes += 1;
    return 'Подписка разработчика активна 30 дней. К ней добавлен ящик.';
  }
  const status = await payWithStars(subscriptionLink);
  if (status === 'paid') {
    profile.subscriptionUntil = Date.now() + SUBSCRIPTION_MS;
    profile.boxes += 1;
    return 'Подписка оплачена звёздами Telegram. Ящик уже в лавке.';
  }
  if (status === 'cancelled') return 'Оплата подписки отменена.';
  return 'Счёт Stars откроется в Telegram. Задайте VITE_STARS_SUBSCRIPTION_LINK.';
}

export async function purchaseBox(profile: PlayerProfile): Promise<string> {
  if (developerToolsEnabled() && profile.developer) {
    profile.boxes += 1;
    return 'Ящик добавлен из ресурсов разработчика.';
  }
  const status = await payWithStars(boxLink);
  if (status === 'paid') {
    profile.boxes += 1;
    return 'Ящик оплачен звёздами Telegram.';
  }
  if (status === 'cancelled') return 'Покупка ящика отменена.';
  return 'Счёт Stars откроется в Telegram. Задайте VITE_STARS_BOX_LINK.';
}

export async function watchRewardedAd(profile: PlayerProfile): Promise<string> {
  if (developerToolsEnabled() && profile.developer) {
    profile.boxes += 1;
    return 'Реклама для разработчика пропущена. Ящик получен.';
  }
  const watched = await showRewardedPlacement();
  if (!watched) return 'Реклама закрыта раньше времени. Ящик не выдан.';
  profile.boxes += 1;
  return 'Реклама досмотрена. Ящик получен.';
}

export function openBox(profile: PlayerProfile): string {
  if (profile.boxes <= 0) return 'Ящиков нет. Их даёт реклама, подписка или покупка за Stars.';
  profile.boxes -= 1;
  const roll = Math.random();
  if (roll < 0.45) {
    const gold = 40 + Math.floor(Math.random() * 61);
    profile.gold += gold;
    return `В ящике ${gold} золота.`;
  }
  if (roll < 0.7) {
    profile.weapon = Math.min(100, profile.weapon + 1);
    return 'В ящике заточка оружия: +1 к мастерству.';
  }
  if (roll < 0.88) {
    profile.strength = Math.min(100, profile.strength + 1);
    return 'В ящике тренировочный груз: +1 к силе.';
  }
  const locked = (['ember', 'azure'] as SkinName[]).filter((skin) => !profile.unlockedSkins.includes(skin));
  const skin = locked[Math.floor(Math.random() * locked.length)];
  if (!skin) {
    profile.gold += 80;
    return 'Облики уже открыты. В ящике 80 золота.';
  }
  profile.unlockedSkins.push(skin);
  profile.skin = skin;
  return skin === 'ember'
    ? 'В ящике облик «Пепел арены». Он уже надет.'
    : 'В ящике облик «Страж севера». Он уже надет.';
}

function payWithStars(url: string): Promise<'paid' | 'cancelled' | 'unavailable'> {
  const openInvoice = window.Telegram?.WebApp?.openInvoice;
  if (!url || !openInvoice) return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    openInvoice(url, (status) => {
      resolve(status === 'paid' ? 'paid' : 'cancelled');
    });
  });
}

function showRewardedPlacement(): Promise<boolean> {
  const existing = document.querySelector('.rewarded-ad');
  existing?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'rewarded-ad';
  overlay.innerHTML = `
    <div class="rewarded-card" role="dialog" aria-label="Реклама">
      <small>РЕКЛАМА · TELEGRAM</small>
      <strong>Пески славы</strong>
      <p>Короткий ролик спонсора арены. Награда — один ящик, если досмотреть до конца.</p>
      <b id="rewarded-timer">4</b>
      <button type="button" id="rewarded-close" disabled>ДОСМОТРЕТЬ</button>
      <button type="button" id="rewarded-dismiss">Закрыть без награды</button>
    </div>`;
  document.body.append(overlay);
  const timer = overlay.querySelector<HTMLElement>('#rewarded-timer');
  const close = overlay.querySelector<HTMLButtonElement>('#rewarded-close');
  let left = REWARDED_AD_MS / 1000;
  return new Promise((resolve) => {
    const tick = window.setInterval(() => {
      left -= 1;
      if (timer) timer.textContent = String(Math.max(left, 0));
      if (left <= 0) {
        window.clearInterval(tick);
        if (close) {
          close.disabled = false;
          close.textContent = 'ЗАБРАТЬ ЯЩИК';
        }
      }
    }, 1000);
    const finish = (rewarded: boolean) => {
      window.clearInterval(tick);
      overlay.remove();
      resolve(rewarded);
    };
    close?.addEventListener('click', () => {
      if (left <= 0) finish(true);
    });
    overlay.querySelector('#rewarded-dismiss')?.addEventListener('click', () => finish(false));
  });
}
