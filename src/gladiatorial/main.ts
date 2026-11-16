import { createArena } from './arena';
import {
  blockDurationMs,
  counterDurationMs,
  hardHitDurationMs,
  lowHitDurationMs,
} from './dragonbones-fighter';
import portraitUrl from './assets/after_PS/голова.png';
import {
  BOX_STARS,
  SUBSCRIPTION_STARS,
  developerToolsEnabled,
  grantDeveloperResources,
  openBox,
  purchaseBox,
  purchaseSubscription,
  subscriptionActive,
  watchRewardedAd,
} from './monetization';
import {
  OPPONENTS,
  getOpponent,
  isTrainingDummy,
  opponentCombat,
  opponentDisplayName,
  opponentMechanics,
  type Opponent,
} from './opponents';
import {
  DEFAULT_PROFILE,
  STORAGE_KEY,
  type PlayerProfile,
  type SkinName,
  type StatName,
} from './types';
import './style.css';

type ViewName = 'arena' | 'forge' | 'hero' | 'market';
type ArenaMode = 'roster' | 'fight';
type ApiResponse<T> = T & { error?: string };

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Application root was not found.');
  return root;
}

const app = getAppRoot();

const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
telegram?.disableVerticalSwipes();

let profile = loadLocalProfile();
let activeView: ViewName = 'arena';
let arenaMode: ArenaMode = 'roster';
let selectedOpponentId = OPPONENTS[0]?.id ?? 'pall';
let arenaGame: Phaser.Game | undefined;
let apiConnected = false;
let attackLocked = false;
let actionLockTimer: number | undefined;
let battleStarted = false;
let toastTimer: number | undefined;

function loadLocalProfile(): PlayerProfile {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_PROFILE };
    const parsed: Partial<PlayerProfile> = JSON.parse(saved);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      unlockedSkins: Array.isArray(parsed.unlockedSkins)
        ? parsed.unlockedSkins
        : DEFAULT_PROFILE.unlockedSkins,
      boxes: typeof parsed.boxes === 'number' ? parsed.boxes : 0,
      subscriptionUntil: typeof parsed.subscriptionUntil === 'number' ? parsed.subscriptionUntil : 0,
      developer: developerToolsEnabled() && parsed.developer === true,
    };
  } catch (error) {
    console.error('Could not read the saved gladiator profile.', error);
    return { ...DEFAULT_PROFILE };
  }
}

function saveLocalProfile(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

async function apiRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (telegram?.initData) headers.authorization = `tma ${telegram.initData}`;

  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(payload.error ?? `Ошибка сервера (${response.status})`);
  return payload;
}

async function connectProfile(): Promise<void> {
  if (!telegram?.initData) return;
  try {
    profile = await apiRequest<PlayerProfile>('/api/profile');
    apiConnected = true;
    saveLocalProfile();
  } catch (error) {
    console.error('The online profile could not be loaded.', error);
    showToast('Сервер недоступен. Играем в автономном режиме.');
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function statPrice(stat: StatName): number {
  const current = profile[stat];
  return 30 + (current - (stat === 'vitality' ? 100 : stat === 'strength' ? 10 : 1)) * 12;
}

async function upgradeStat(stat: StatName): Promise<void> {
  const price = statPrice(stat);
  if (profile.gold < price) {
    showToast('Не хватает золота. Проведи бой на арене.');
    return;
  }
  try {
    if (apiConnected) {
      profile = await apiRequest<PlayerProfile>('/api/progression/upgrade', 'POST', { stat });
    } else {
      profile.gold -= price;
      profile[stat] += stat === 'vitality' ? 10 : 1;
    }
    saveLocalProfile();
    render();
    showToast('Характеристика улучшена.');
  } catch (error) {
    console.error('Could not upgrade the gladiator.', error);
    showToast(error instanceof Error ? error.message : 'Не удалось улучшить характеристику.');
  }
}

async function buySkin(skin: SkinName): Promise<void> {
  const cost = skin === 'ember' ? 80 : 110;
  if (profile.unlockedSkins.includes(skin)) {
    profile.skin = skin;
  } else if (profile.gold < cost) {
    showToast('Не хватает золота для этого образа.');
    return;
  } else if (apiConnected) {
    try {
      profile = await apiRequest<PlayerProfile>('/api/cosmetics/buy', 'POST', { skin });
    } catch (error) {
      console.error('Could not purchase the cosmetic.', error);
      showToast(error instanceof Error ? error.message : 'Не удалось купить образ.');
      return;
    }
  } else {
    profile.gold -= cost;
    profile.unlockedSkins.push(skin);
    profile.skin = skin;
  }
  if (apiConnected && profile.unlockedSkins.includes(skin)) {
    try {
      profile = await apiRequest<PlayerProfile>('/api/cosmetics/equip', 'POST', { skin });
    } catch (error) {
      console.error('Could not equip the cosmetic.', error);
      showToast(error instanceof Error ? error.message : 'Не удалось надеть образ.');
      return;
    }
  }
  saveLocalProfile();
  render();
}

function render(): void {
  arenaGame?.destroy(true);
  arenaGame = undefined;

  // Бой — отдельный полноэкранный портретный экран, без меню.
  if (activeView === 'arena' && arenaMode === 'fight') {
    app.innerHTML = `
      <div class="fight-shell">
        ${renderArenaFight(selectedOpponent())}
        <div id="toast" class="toast" role="status"></div>
      </div>`;
    bindFightChrome();
    mountArena();
    return;
  }

  app.innerHTML = `
    <div class="game-shell menu-shell">
      <header class="topbar">
        <a class="brand" href="#" data-view="arena" aria-label="На арену">
          <span class="brand-mark">G</span>
          <span class="brand-name">GLADIATORS<small>ПУТЬ ЧЕМПИОНА</small></span>
        </a>
        <div class="topbar-right">
          <a class="hub-back" href="../">← Все игры</a>
          <span class="wallet"><span class="coin">✦</span><strong>${profile.gold}</strong></span>
          <span class="wallet boxes-wallet"><span class="coin">▣</span><strong>${profile.boxes}</strong></span>
        </div>
      </header>
      <main class="layout menu-layout">
        <section class="content">
          ${activeView === 'arena' ? renderArenaRoster() : activeView === 'forge' ? renderForge() : activeView === 'hero' ? renderHero() : renderMarket()}
        </section>
      </main>
      <nav class="mobile-nav" aria-label="Главное меню">
        <button type="button" data-view="arena" class="${activeView === 'arena' ? 'active' : ''}"><span>⚔</span>Арена</button>
        <button type="button" data-view="forge" class="${activeView === 'forge' ? 'active' : ''}"><span>⌘</span>Арсенал</button>
        <button type="button" data-view="hero" class="${activeView === 'hero' ? 'active' : ''}"><span>♙</span>Герой</button>
        <button type="button" data-view="market" class="${activeView === 'market' ? 'active' : ''}"><span>▣</span>Лавка</button>
      </nav>
      <div id="toast" class="toast" role="status"></div>
    </div>`;
  bindNavigation();
  if (activeView === 'arena') bindArenaRoster();
  if (activeView === 'forge') bindForge();
  if (activeView === 'hero') bindHero();
  if (activeView === 'market') bindMarket();
}

function bindFightChrome(): void {
  app.querySelector('[data-leave-arena]')?.addEventListener('click', () => {
    arenaMode = 'roster';
    battleStarted = false;
    render();
  });
}

function selectedOpponent(): Opponent {
  return getOpponent(selectedOpponentId) ?? OPPONENTS[0]!;
}

function renderArenaRoster(): string {
  const selected = selectedOpponent();
  const combat = opponentCombat(selected);
  const mechanics = opponentMechanics(selected);
  return `
    <div class="page-heading page-heading-compact">
      <div><div class="eyebrow"><span class="eyebrow-line"></span> АРЕНА</div><h1>Выбери <em>врага</em></h1></div>
      <div class="rank-chip"><span>Ⅰ</span><div><small>УР.</small><strong>${profile.level}</strong></div></div>
    </div>
    <div class="roster-vertical">
      <div class="opponent-list">
        ${OPPONENTS.map((opponent) => opponentCard(opponent)).join('')}
      </div>
      <aside class="roster-aside roster-aside-sticky roster-aside-compact">
        <div class="roster-pick-row">
          <h2>${escapeHtml(opponentDisplayName(selected))}</h2>
          <button type="button" class="info-toggle" data-info-toggle aria-label="Описание" aria-expanded="false">i</button>
        </div>
        <div class="roster-info-panel" hidden data-info-panel>
          <div class="eyebrow">${escapeHtml(combat.label.toUpperCase())}</div>
          <p>${escapeHtml(selected.blurb)}</p>
          <div class="roster-stats">
            <div><small>${isTrainingDummy(selected) ? 'ПРОЧН.' : 'HP'}</small><strong>${selected.hp}</strong></div>
            <div><small>УДАР</small><strong>${isTrainingDummy(selected) ? '—' : selected.damage}</strong></div>
            <div><small>✦</small><strong>${selected.goldWin[0]}–${selected.goldWin[1]}</strong></div>
          </div>
          <div class="aside-mechanics aside-mechanics-compact">
            ${mechanics.slice(0, 4).map((m) => `<div class="aside-mech"><strong>${escapeHtml(m.title)}</strong><span>${escapeHtml(m.blurb)}</span></div>`).join('')}
          </div>
        </div>
        <button class="primary-button enter-arena-button" data-enter-arena ${selected.unlocked ? '' : 'disabled'}><span>В БОЙ</span><b>→</b></button>
      </aside>
    </div>`;
}

function opponentCard(opponent: Opponent): string {
  const selected = opponent.id === selectedOpponentId;
  const markById: Record<string, string> = {
    pall: 'Ⅰ', ferr: 'Ⅱ', ulf: 'Ⅲ', lin: 'Ⅳ', kai: 'Ⅴ', oro: 'Ⅵ',
  };
  const mark = markById[opponent.id] ?? '⚔';
  return `<button class="opponent-card ${selected ? 'selected' : ''} ${opponent.unlocked ? '' : 'locked'}" data-opponent="${opponent.id}" ${opponent.unlocked ? '' : 'disabled'}>
    <span class="opponent-mark">${mark}</span>
    <span class="opponent-copy"><small>${escapeHtml(opponent.label)}</small><strong>${escapeHtml(opponentDisplayName(opponent))}</strong></span>
    <span class="opponent-meta">${selected ? 'ВЫБРАН' : opponent.unlocked ? 'ОТКРЫТ' : 'ЗАКРЫТО'}</span>
  </button>`;
}

function renderArenaFight(opponent: Opponent): string {
  const training = isTrainingDummy(opponent);
  const combat = opponentCombat(opponent);
  const status = training ? `${opponent.name} ждёт ударов` : `${opponent.name} на арене`;
  return `
    <header class="fight-top">
      <button type="button" class="fight-back" data-leave-arena aria-label="К списку">←</button>
      <div class="fight-title">
        <small>${escapeHtml(opponent.label)} · ${escapeHtml(combat.label)}</small>
        <strong>${escapeHtml(opponentDisplayName(opponent))}</strong>
      </div>
      <div class="fight-gold">✦ ${profile.gold}</div>
    </header>
    <div class="fight-hud">
      <div class="fighter-info player-info">
        <div class="fighter-name">${escapeHtml(profile.username)}<span>УР. ${profile.level}</span></div>
        <div class="health-track"><i id="player-health" style="width:100%"></i></div>
        <div class="health-caption"><span>HP</span><b id="player-hp">${profile.vitality}</b></div>
        <div class="resource-track shield-track"><i id="shield-bar" style="width:100%"></i></div>
        <div class="health-caption"><span>ЩИТ</span><b id="shield-hp">100</b></div>
      </div>
      <div class="fighter-info enemy-info">
        <div class="fighter-name">${escapeHtml(opponent.name)}<span>${training ? 'СТОЛБ' : 'ВРАГ'}</span></div>
        <div class="health-track enemy-track"><i id="enemy-health" style="width:100%"></i></div>
        <div class="health-caption"><span>${training ? 'ПРОЧН.' : 'HP'}</span><b id="enemy-hp">${opponent.hp}</b></div>
        <div class="resource-track blood-track"><i id="blood-bar" style="width:0%"></i></div>
        <div class="health-caption"><span>СЕРИЯ</span><b id="blood-hits">0/3</b></div>
      </div>
    </div>
    <div class="fight-stage">
      <div id="arena-canvas" class="arena-canvas"></div>
      <div id="floating-damage" class="floating-damage" aria-live="polite"></div>
    </div>
    <div class="arena-caption fight-status"><span class="caption-dot"></span><span id="battle-status">${escapeHtml(status)}</span></div>
    <div class="controls controls-with-finish fight-controls">
      <button id="block-button" class="action-button block-button" type="button" aria-label="Блок"><span class="button-glyph">◈</span><span>БЛОК</span><small>Щит</small></button>
      <button id="attack-button" class="action-button attack-button" type="button" aria-label="Атака"><span class="button-glyph">⚔</span><span>АТАКА</span><small>Удар</small></button>
      <button id="counter-button" class="action-button counter-button" type="button" aria-label="Контр"><span class="button-glyph">↯</span><span>КОНТР</span><small>Парир.</small></button>
      <button id="hard-attack-button" class="action-button hard-attack-button" type="button" aria-label="Выпад"><span class="button-glyph">⛏</span><span>ВЫПАД</span><small>Сильный</small></button>
      <button id="finish-button" class="action-button finish-button" type="button" aria-label="Добивание" disabled><span class="button-glyph">☠</span><span>ДОБИТЬ</span><small>Серия</small></button>
    </div>`;
}

function bindArenaRoster(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-opponent]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.opponent;
      if (!id || !getOpponent(id)?.unlocked) return;
      selectedOpponentId = id;
      render();
    });
  });
  app.querySelector('[data-enter-arena]')?.addEventListener('click', () => {
    if (!selectedOpponent().unlocked) return;
    arenaMode = 'fight';
    battleStarted = false;
    render();
  });
  const infoToggle = app.querySelector<HTMLButtonElement>('[data-info-toggle]');
  const infoPanel = app.querySelector<HTMLElement>('[data-info-panel]');
  infoToggle?.addEventListener('click', () => {
    if (!infoPanel) return;
    const open = infoPanel.hasAttribute('hidden');
    if (open) infoPanel.removeAttribute('hidden');
    else infoPanel.setAttribute('hidden', '');
    infoToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    infoToggle.classList.toggle('open', open);
  });
}

function renderForge(): string {
  const stats: { key: StatName; title: string; caption: string; icon: string }[] = [
    { key: 'strength', title: 'Сила', caption: 'Больше урона за каждый удар.', icon: '⚔' },
    { key: 'vitality', title: 'Живучесть', caption: 'Больше здоровья в бою.', icon: '♡' },
    { key: 'weapon', title: 'Мастерство оружия', caption: 'Удар мощнее, защита надёжнее.', icon: '⌁' },
  ];
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> МАСТЕРСКАЯ</div><h1>Стань <em>сильнее.</em></h1><p>Путь чемпиона начинается с тренировки.</p></div></div>
    <div class="forge-layout">
      <div class="forge-main">
        <div class="section-title"><span>ХАРАКТЕРИСТИКИ</span><i></i><small>УЛУЧШАЙ ЗА ЗОЛОТО</small></div>
        <div class="stats-list">${stats.map(({ key, title, caption, icon }) => {
          const value = profile[key];
          const price = statPrice(key);
          const progress = key === 'vitality' ? Math.min(value / 170 * 100, 100) : Math.min(value / 50 * 100, 100);
          return `<article class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-copy"><strong>${title}</strong><small>${caption}</small><div class="stat-progress"><i style="width:${progress}%"></i></div></div><div class="stat-value"><strong>${value}</strong><small>УРОВЕНЬ</small></div><button class="upgrade-button" data-upgrade="${key}"><span>✦ ${price}</span><b>+</b></button></article>`;
        }).join('')}</div>
      </div>
      <aside class="forge-aside"><div class="forge-ornament">⚒</div><div class="eyebrow">ПУТЬ К ЧЕМПИОНСТВУ</div><h2>Каждый удар<br>имеет значение.</h2><p>Испытай обновлённую силу на арене. Победы приносят золото и опыт.</p><div class="reward-row"><span>НАГРАДА ЗА ПОБЕДУ</span><strong>✦ 25–35</strong></div><button class="primary-button" data-view="arena">ВЕРНУТЬСЯ НА АРЕНУ <b>→</b></button></aside>
    </div>
    <div class="section-title cosmetics-title"><span>ОБЛИКИ</span><i></i><small>ТВОЙ СТИЛЬ · ТВОИ ПРАВИЛА</small></div>
    <div class="skin-list">${skinCard('bronze', 'Бронзовый легион', 'КЛАССИЧЕСКИЙ', 0)}${skinCard('ember', 'Пепел арены', 'ОБРАЗ · I', 80)}${skinCard('azure', 'Страж севера', 'ОБРАЗ · II', 110)}</div>`;
}

function skinCard(skin: SkinName, title: string, label: string, price: number): string {
  const owned = profile.unlockedSkins.includes(skin);
  return `<button class="skin-card skin-${skin} ${profile.skin === skin ? 'equipped' : ''}" data-skin="${skin}"><span class="skin-swatch"></span><span class="skin-copy"><small>${label}</small><strong>${title}</strong></span><span class="skin-action">${profile.skin === skin ? 'НАДЕТ' : owned ? 'ВЫБРАТЬ' : `✦ ${price}`}</span></button>`;
}

function renderHero(): string {
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> ЗАЛ СЛАВЫ</div><h1>Твоя <em>легенда.</em></h1><p>Каждый великий боец когда-то начинал с первой победы.</p></div></div>
    <section class="hero-card"><div class="hero-portrait skin-${profile.skin}"><div class="portrait-glow"></div><img class="portrait-art" src="${portraitUrl}" alt=""><span class="portrait-level">УР. ${profile.level}</span></div><div class="hero-details"><div class="eyebrow">ГЛАДИАТОР · НОВИЧОК</div><h2>${escapeHtml(profile.username)}</h2><p>Боец песчаной арены</p><div class="hero-xp"><span>ОПЫТ</span><b>${profile.xp % 100} / 100 XP</b></div><div class="stat-progress"><i style="width:${profile.xp % 100}%"></i></div><div class="hero-stat-grid"><div><small>СИЛА</small><strong>${profile.strength}</strong></div><div><small>ЗДОРОВЬЕ</small><strong>${profile.vitality}</strong></div><div><small>ОРУЖИЕ</small><strong>+${profile.weapon}</strong></div><div><small>ПОБЕДЫ</small><strong>${Math.floor(profile.xp / 35)}</strong></div></div></div></section>
    <div class="section-title hero-section-title"><span>ПРОГРЕСС</span><i></i><small>СЕЗОН I</small></div><section class="progress-card"><div class="progress-emblem">Ⅰ</div><div><strong>Пески славы</strong><p>Сражайся, зарабатывай опыт и открывай новые облики.</p></div><div class="progress-level"><small>ТЕКУЩИЙ УРОВЕНЬ</small><b>${profile.level}</b></div></section>
    <button class="primary-button hero-arena-button" data-view="arena">ВЫЙТИ НА АРЕНУ <b>→</b></button>`;
}

function renderMarket(): string {
  const subscribed = subscriptionActive(profile);
  const until = subscribed
    ? new Date(profile.subscriptionUntil).toLocaleDateString('ru-RU')
    : 'не активна';
  const developer = developerToolsEnabled()
    ? `<button class="primary-button developer-grant" data-developer="grant"><span>РЕСУРСЫ РАЗРАБОТЧИКА</span><b>→</b></button><p class="market-note">Только в этой сборке для разработки: золото, все облики, подписка и 20 ящиков. Реклама и счета Stars после этого не требуются.</p>`
    : '';
  return `
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> TELEGRAM · STARS</div><h1>Лавка <em>арены.</em></h1><p>Реклама, подписка и ящики остаются внутри мини-приложения.</p></div></div>
    <div class="market-grid">
      <article class="market-card">
        <small>ПОДПИСКА · 30 ДНЕЙ</small>
        <strong>Пески славы</strong>
        <p>+15% золота за бой и ящик при оформлении. Оплата — ${SUBSCRIPTION_STARS} звёзд Telegram.</p>
        <div class="reward-row"><span>СТАТУС</span><strong>${subscribed ? `до ${until}` : until}</strong></div>
        <button class="primary-button" data-market="subscribe"><span>${subscribed ? 'ПРОДЛИТЬ' : 'ОФОРМИТЬ'}</span><b>★ ${SUBSCRIPTION_STARS}</b></button>
      </article>
      <article class="market-card">
        <small>РЕКЛАМА</small>
        <strong>Ролик спонсора</strong>
        <p>Досмотрите рекламу в окне мини-приложения и получите один ящик.</p>
        <button class="primary-button" data-market="ad"><span>СМОТРЕТЬ</span><b>+1 ▣</b></button>
      </article>
      <article class="market-card">
        <small>ЯЩИКИ · ${profile.boxes}</small>
        <strong>Ящик арены</strong>
        <p>Золото, сила, оружие или новый облик. Покупка — ${BOX_STARS} звёзд Telegram.</p>
        <div class="market-actions">
          <button class="primary-button" data-market="buy-box"><span>КУПИТЬ</span><b>★ ${BOX_STARS}</b></button>
          <button class="upgrade-button" data-market="open-box"><span>ОТКРЫТЬ</span><b>▣</b></button>
        </div>
      </article>
    </div>
    ${developer}`;
}

function bindNavigation(): void {
  app.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'arena' || view === 'forge' || view === 'hero' || view === 'market') {
        activeView = view;
        if (view === 'arena') arenaMode = 'roster';
        render();
      }
    });
  });
  app.querySelector('[data-leave-arena]')?.addEventListener('click', () => {
    arenaMode = 'roster';
    battleStarted = false;
    render();
  });
}

function bindMarket(): void {
  app.querySelector('[data-developer="grant"]')?.addEventListener('click', () => {
    grantDeveloperResources(profile);
    saveLocalProfile();
    render();
    showToast('Ресурсы разработчика выданы.');
  });
  app.querySelector('[data-market="subscribe"]')?.addEventListener('click', () => {
    void runMarketAction(() => purchaseSubscription(profile));
  });
  app.querySelector('[data-market="ad"]')?.addEventListener('click', () => {
    void runMarketAction(() => watchRewardedAd(profile));
  });
  app.querySelector('[data-market="buy-box"]')?.addEventListener('click', () => {
    void runMarketAction(() => purchaseBox(profile));
  });
  app.querySelector('[data-market="open-box"]')?.addEventListener('click', () => {
    const message = openBox(profile);
    saveLocalProfile();
    render();
    showToast(message);
  });
}

async function runMarketAction(action: () => Promise<string>): Promise<void> {
  const message = await action();
  saveLocalProfile();
  render();
  showToast(message);
}

function bindForge(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
    button.addEventListener('click', () => {
      const stat = button.dataset.upgrade;
      if (stat === 'strength' || stat === 'vitality' || stat === 'weapon') void upgradeStat(stat);
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((button) => {
    button.addEventListener('click', () => {
      const skin = button.dataset.skin;
      if (skin === 'bronze' || skin === 'ember' || skin === 'azure') void buySkin(skin);
    });
  });
}

function bindHero(): void {
  app.querySelector('.avatar')?.classList.add('selected');
}

function mountArena(): void {
  const mount = app.querySelector<HTMLElement>('#arena-canvas');
  if (!mount) return;
  battleStarted = false;
  arenaGame = createArena(mount, profile, selectedOpponent(), onArenaEvent);
  app.querySelector('#attack-button')?.addEventListener('click', () => strike('battle:attack', lowHitDurationMs, '#attack-button'));
  app.querySelector('#hard-attack-button')?.addEventListener('click', () => strike('battle:hard-attack', hardHitDurationMs, '#hard-attack-button'));
  app.querySelector('#finish-button')?.addEventListener('click', () => {
    const button = app.querySelector<HTMLButtonElement>('#finish-button');
    if (!button || button.disabled || attackLocked) return;
    strike('battle:finish', hardHitDurationMs, '#finish-button');
  });
  app.querySelector<HTMLButtonElement>('#block-button')?.addEventListener('pointerdown', (event) => guard(event, 'battle:block', blockDurationMs, '#block-button'));
  app.querySelector<HTMLButtonElement>('#counter-button')?.addEventListener('pointerdown', (event) => guard(event, 'battle:counter', counterDurationMs, '#counter-button'));
}

function ensureBattleStarted(scene: Phaser.Scene | undefined): void {
  if (battleStarted) return;
  scene?.events.emit('battle:start');
  battleStarted = true;
}

function getArenaScene(): Phaser.Scene | undefined {
  return arenaGame?.scene.getScene('Arena') as Phaser.Scene | undefined;
}

function clearActionLock(): void {
  if (actionLockTimer !== undefined) {
    window.clearTimeout(actionLockTimer);
    actionLockTimer = undefined;
  }
  attackLocked = false;
  for (const id of ['#attack-button', '#hard-attack-button', '#block-button', '#counter-button', '#finish-button']) {
    app.querySelector<HTMLButtonElement>(id)?.classList.remove('pressed');
  }
}

function lockActions(lockMs: number, buttonSelector: string): void {
  clearActionLock();
  attackLocked = true;
  const button = app.querySelector<HTMLButtonElement>(buttonSelector);
  button?.classList.add('pressed');
  actionLockTimer = window.setTimeout(() => {
    actionLockTimer = undefined;
    attackLocked = false;
    button?.classList.remove('pressed');
  }, Math.ceil(lockMs));
}

function strike(eventName: string, lockMs: number, buttonSelector: string): void {
  if (attackLocked) return;
  const scene = getArenaScene();
  ensureBattleStarted(scene);
  if (!scene) {
    console.error('Arena scene missing for', eventName);
    return;
  }
  scene.events.emit(eventName);
  lockActions(lockMs, buttonSelector);
}

function guard(event: PointerEvent, eventName: string, lockMs: number, buttonSelector: string): void {
  event.preventDefault();
  if (!battleStarted || !arenaGame || attackLocked) return;
  const scene = arenaGame.scene.getScene('Arena') as Phaser.Scene | undefined;
  scene?.events.emit(eventName);
  lockActions(lockMs, buttonSelector);
}

function onArenaEvent(event: string, value?: unknown): void {
  if (event === 'arena:health' && value && typeof value === 'object') {
    const health = value as { player: number; maxPlayer: number; opponent: number; maxOpponent: number };
    setText('#player-hp', String(health.player));
    setText('#enemy-hp', String(health.opponent));
    setWidth('#player-health', health.player / health.maxPlayer);
    setWidth('#enemy-health', health.opponent / health.maxOpponent);
    document.querySelector('#player-health')?.classList.toggle('low', health.player / health.maxPlayer < 0.3);
    return;
  }
  if (event === 'arena:interrupt') {
    clearActionLock();
    setText('#battle-status', 'Удар сорван — тебя попали');
    document.querySelector('.caption-dot')?.classList.remove('warning');
    return;
  }
  if (event === 'arena:telegraph') {
    const foe = selectedOpponent();
    const pattern = value && typeof value === 'object' && 'pattern' in value
      ? String((value as { pattern: string }).pattern)
      : 'normal';
    const byPattern: Record<string, string> = {
      feint: `${foe.name} финтит — не жми блок рано`,
      double: `${foe.name}: двойной удар — держи блок`,
      heavy: `${foe.name}: ТЯЖЁЛЫЙ замах!`,
      normal: `${foe.name} замахивается — блок или контр`,
    };
    setText('#battle-status', byPattern[pattern] ?? byPattern.normal!);
    document.querySelector('.caption-dot')?.classList.add('warning');
    return;
  }
  if (event === 'arena:status' && typeof value === 'string') {
    setText('#battle-status', value);
    return;
  }
  if (event === 'arena:combat' && value && typeof value === 'object') {
    const hud = value as {
      shield: number;
      shieldMax: number;
      blood: number;
      bloodNeed: number;
      finishReady: boolean;
    };
    setText('#shield-hp', String(hud.shield));
    setWidth('#shield-bar', hud.shield / hud.shieldMax);
    setText('#blood-hits', `${hud.blood}/${hud.bloodNeed}`);
    setWidth('#blood-bar', hud.blood / hud.bloodNeed);
    const finish = app.querySelector<HTMLButtonElement>('#finish-button');
    if (finish) {
      finish.disabled = !hud.finishReady;
      finish.classList.toggle('ready', hud.finishReady);
    }
    return;
  }
  if (event === 'arena:finish-ready') {
    setText('#battle-status', 'Кровавая серия! Жми «Добить»');
    app.querySelector('#finish-button')?.classList.add('ready');
    return;
  }
  if (event === 'arena:stun') {
    setText('#battle-status', 'Оглушение — подожди мгновение');
    return;
  }
  if (event === 'arena:ready') {
    const ready = isTrainingDummy(selectedOpponent())
      ? 'Нажми «Атака» или «Выпад», чтобы начать тренировку'
      : 'Нажми «Атака» или «Выпад», чтобы начать бой';
    setText('#battle-status', ready);
    return;
  }
  if (event === 'arena:damage' && value && typeof value === 'object') {
    const hit = value as { side: string; amount: number; critical: boolean };
    const damage = document.querySelector<HTMLDivElement>('#floating-damage');
    if (damage) {
      damage.textContent = hit.side === 'opponent'
        ? `${hit.critical ? 'ИДЕАЛЬНО! ' : ''}−${hit.amount} УРОНА`
        : `−${hit.amount} ЗДОРОВЬЯ`;
      damage.classList.remove('animate');
      void damage.offsetWidth;
      damage.classList.add('animate');
    }
    setText('#battle-status', hit.side === 'opponent' ? `Точный удар: ${hit.amount} урона` : `Ты получил ${hit.amount} урона`);
    document.querySelector('.caption-dot')?.classList.remove('warning');
    return;
  }
  if (event === 'arena:finished' && value && typeof value === 'object') {
    const result = value as { won: boolean; gold: number; xp: number };
    battleStarted = false;
    for (const id of ['#attack-button', '#hard-attack-button', '#block-button', '#counter-button', '#finish-button']) {
      app.querySelector<HTMLButtonElement>(id)?.setAttribute('disabled', '');
    }
    const gold = subscriptionActive(profile) ? Math.round(result.gold * 1.15) : result.gold;
    profile.gold += gold;
    profile.xp += result.xp;
    while (profile.xp >= 100) {
      profile.xp -= 100;
      profile.level += 1;
    }
    saveLocalProfile();
    showToast(`${result.won ? 'Победа!' : 'Бой окончен.'} +${gold} золота · +${result.xp} XP`);
    const status = document.querySelector('#battle-status');
    if (status) status.textContent = `${result.won ? 'Победа! ' : 'Поражение. '}Награда: ${gold} золота · ${result.xp} XP`;
    window.setTimeout(() => {
      if (activeView === 'arena') {
        arenaMode = 'roster';
        render();
      }
    }, 2400);
  }
}

function setText(selector: string, value: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setWidth(selector: string, ratio: number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

void (async () => {
  await connectProfile();
  render();
})();
