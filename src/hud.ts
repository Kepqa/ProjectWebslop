import { SLOTS, UPGRADES, activeSynergies, byId, slotOf, slotsUsed, synergiesOf, type Levels, type UpgradeDef } from './upgrades';
import { sfx } from './sfx';

const $ = (id: string) => document.getElementById(id)!;

export interface DevAction { label: string | (() => string); fn: () => void; on?: () => boolean }

export class Hud {
  private hpFill = $('hp-fill');
  private hpText = $('hp-text');
  private energyFill = $('energy-fill');
  private energyBar = $('energy-bar');
  private xpFill = $('xp-fill');
  private timeEl = $('time');
  private killsEl = $('kills');
  private levelEl = $('level');
  private itemsEl = $('items');
  private toastEl = $('toast');
  private toastTimer = 0;
  private last = '';

  private bossEl = $('boss');
  private bossName = $('boss-name');
  private bossFill = $('boss-fill');
  private joyBase = $('joy-base');
  private joyKnob = $('joy-knob');
  private joyState = '';

  onPause: () => void = () => {};
  private devActions: DevAction[] = [];
  private voteTimer = 0;

  constructor() {
    $('pause').onclick = () => this.onPause();
    $('dev-btn').onclick = () => { $('dev-panel').classList.toggle('hidden'); this.renderDev(); };
  }

  /** Панель разработчика (null — скрыть кнопку). */
  setDev(actions: DevAction[] | null) {
    this.devActions = actions ?? [];
    $('dev-btn').classList.toggle('hidden', !actions);
    if (!actions) $('dev-panel').classList.add('hidden');
    else this.renderDev();
  }

  setDevStats(text: string) { $('dev-stats').textContent = text; }

  private renderDev() {
    const wrap = $('dev-buttons');
    wrap.innerHTML = '';
    for (const a of this.devActions) {
      const b = document.createElement('button');
      b.textContent = typeof a.label === 'function' ? a.label() : a.label;
      if (a.on?.()) b.classList.add('on');
      b.onclick = () => { a.fn(); this.renderDev(); };
      wrap.appendChild(b);
    }
  }

  setFps(text: string | null) {
    const el = $('fps');
    el.classList.toggle('hidden', text === null);
    if (text !== null) el.textContent = text;
  }

  show(coop = false) {
    $('hud').classList.remove('hidden');
    $('hud').classList.toggle('coop', coop);
    for (const id of ['levelup', 'end']) $(id).classList.add('hidden');
    this.closeModals();
  }

  closeModals() {
    for (const id of ['pause-ov', 'vote', 'wait', 'countdown', 'dev-panel']) $(id).classList.add('hidden');
    clearInterval(this.voteTimer);
  }

  private scoreKey = '';
  /** Счёт по центру сверху и текущая серия комбо с таймером. */
  setScore(score: number, combo: number, mul: number, timer: number, frenzy: boolean) {
    const key = `${score}|${combo}|${(timer * 20) | 0}|${frenzy}`;
    if (key === this.scoreKey) return;
    const prevCombo = Number(this.scoreKey.split('|')[1] || 0);
    this.scoreKey = key;
    $('score-num').textContent = score.toLocaleString('ru-RU');
    const c = $('combo');
    c.classList.toggle('hidden', combo < 2);
    c.classList.toggle('frenzy', frenzy);
    c.classList.toggle('hot', combo >= 25);
    $('combo-txt').textContent = `${combo} комбо · ×${mul.toFixed(1)}`;
    ($('combo-fill') as HTMLElement).style.width = `${Math.max(0, Math.min(1, timer)) * 100}%`;
    if (combo > prevCombo) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  }

  /** Текст текущей цели (сюжет). */
  setObjective(text: string | null) {
    const el = $('objective');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.textContent !== text) el.textContent = text;
  }

  /** Стрелка к цели у края экрана (x,y — экранные CSS-координаты цели). Если цель на экране — скрыта. */
  setWaypoint(w: { x: number; y: number; icon: string; dist: number } | null) {
    const el = $('waypoint');
    const W = window.innerWidth, H = window.innerHeight, m = 46;
    if (!w || (w.x > m && w.x < W - m && w.y > m + 70 && w.y < H - m)) { el.classList.add('hidden'); return; }
    const cx = W / 2, cy = H / 2, dx = w.x - cx, dy = w.y - cy;
    const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), (H / 2 - m - 30) / Math.max(1e-6, Math.abs(dy)));
    const px = cx + dx * k, py = cy + dy * k + 15, ang = Math.atan2(dy, dx);
    el.classList.remove('hidden');
    el.style.left = `${px}px`; el.style.top = `${py}px`;
    const st = `${w.icon}|${w.dist}|${ang.toFixed(2)}`;
    if (el.dataset.st !== st) {
      el.dataset.st = st;
      el.innerHTML = `<span class="wp-arrow" style="transform:rotate(${ang}rad)">➤</span><span class="wp-label">${w.icon} ${w.dist} м</span>`;
    }
  }

  showPause(onResume: () => void, onExit: () => void, note = '', levels?: Levels) {
    $('pause-note').textContent = note;
    $('pause-build').innerHTML = levels ? this.buildHtml(levels) : '';
    $('pause-resume').onclick = () => onResume();
    $('pause-exit').onclick = () => onExit();
    $('pause-ov').classList.remove('hidden');
  }
  hidePause() { $('pause-ov').classList.add('hidden'); }

  /** Голосование «напарник просит паузу» с автоотказом по таймеру. */
  showVote(text: string, sec: number, cb: (ok: boolean) => void) {
    const el = $('vote');
    $('vote-text').textContent = text;
    const fill = $('vote-fill');
    let done = false;
    const finish = (ok: boolean) => { if (done) return; done = true; clearInterval(this.voteTimer); el.classList.add('hidden'); cb(ok); };
    $('vote-yes').onclick = () => finish(true);
    $('vote-no').onclick = () => finish(false);
    const t0 = performance.now();
    clearInterval(this.voteTimer);
    this.voteTimer = window.setInterval(() => {
      const k = 1 - (performance.now() - t0) / (sec * 1000);
      fill.style.width = `${Math.max(0, k) * 100}%`;
      if (k <= 0) finish(false);
    }, 50);
    el.classList.remove('hidden');
  }

  showWait(text: string | null) {
    const el = $('wait');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text; el.classList.remove('hidden');
  }

  showCountdown(n: number | null) {
    const el = $('countdown');
    if (n === null) { el.classList.add('hidden'); return; }
    el.textContent = String(n);
    el.classList.remove('hidden');
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  hide() {
    $('hud').classList.add('hidden');
    for (const id of ['levelup', 'end']) $(id).classList.add('hidden');
    this.closeModals();
    this.setJoystick(null);
  }

  setBoss(name: string | null, frac = 0) {
    if (!name) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    this.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  }

  /** Джойстик в CSS-пикселях: внутренний круг R — шаг, внешний O — бег. */
  setJoystick(mode: 'active' | 'hint' | null, bx = 0, by = 0, kx = 0, ky = 0, R = 50, O = 90, run = false) {
    const st = `${mode}|${bx | 0}|${by | 0}|${kx | 0}|${ky | 0}|${R | 0}|${run}`;
    if (st === this.joyState) return;
    this.joyState = st;
    const outer = $('joy-outer');
    if (!mode) { this.joyBase.style.display = 'none'; this.joyKnob.style.display = 'none'; outer.style.display = 'none'; return; }
    outer.style.display = 'none';
    for (const [el, r, cls] of (O > R ? [[this.joyBase, R, mode], [outer, O, mode + (run ? ' run' : '')]] : [[this.joyBase, R, mode]]) as [HTMLElement, number, string][]) {
      el.style.display = 'block'; el.className = cls;
      Object.assign(el.style, { left: `${bx - r}px`, top: `${by - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
    }
    if (mode === 'active') {
      const k = R * 0.5;
      this.joyKnob.style.display = 'block';
      this.joyKnob.className = run ? 'run' : '';
      Object.assign(this.joyKnob.style, { left: `${kx - k}px`, top: `${ky - k}px`, width: `${k * 2}px`, height: `${k * 2}px` });
    } else this.joyKnob.style.display = 'none';
  }

  update(s: { hp: number; maxHp: number; energy: number; energyMax: number; xp: number; xpNext: number; time: number; total: number; kills: number; level: number; wave?: number }) {
    const key = [s.wave ?? 0, Math.ceil(s.hp), s.maxHp, Math.round(s.energy), s.energyMax, Math.floor(s.xp), s.xpNext, Math.floor(s.time), s.kills, s.level].join('|');
    if (key === this.last) return;
    this.last = key;
    this.hpFill.style.width = `${Math.max(0, s.hp / s.maxHp) * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.ceil(s.hp))} / ${s.maxHp}`;
    this.energyFill.style.width = `${(s.energy / s.energyMax) * 100}%`;
    this.xpFill.style.width = `${Math.min(1, s.xp / s.xpNext) * 100}%`;
    const t = Math.floor(s.time);
    const f = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    this.timeEl.textContent = !isFinite(s.total) || !s.total ? f(t) : s.wave ? `Волна ${s.wave}/10 · ${f(t)}` : `${f(t)} / ${f(Math.floor(s.total))}`;
    this.timeEl.classList.toggle('final', s.wave === 10 || s.total - t <= 60);
    this.killsEl.textContent = String(s.kills);
    this.levelEl.textContent = String(s.level);
  }

  energyEmpty() {
    this.energyBar.classList.remove('empty');
    void this.energyBar.offsetWidth;
    this.energyBar.classList.add('empty');
  }

  setItems(levels: Levels) {
    const it = (u: UpgradeDef) => `<span title="${u.name}">${u.icon}<sub>${levels[u.id]}</sub></span>`;
    const owned = UPGRADES.filter((u) => levels[u.id]);
    const blade = owned.filter((u) => u.kind !== 'trinket').map(it).join('');
    const trink = owned.filter((u) => u.kind === 'trinket').map(it).join('');
    const syn = activeSynergies(levels).map((x) => `<span class="syn" title="${x.name}: ${x.desc}">${x.icon}</span>`).join('');
    this.itemsEl.innerHTML = blade + (trink ? '<i class="sep"></i>' + trink : '') + (syn ? '<i class="sep"></i>' + syn : '');
  }

  toast(msg: string, ms = 1600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showLevelUp(choices: UpgradeDef[], levels: Levels, o: { rerolls: number; onPick: (id: string) => void; onReroll: () => void; onSkip: () => void }) {
    const wrap = $('levelup');
    const cards = $('cards');
    cards.innerHTML = '';
    const used = slotsUsed(levels);
    const KIND = { swipe: 'Свайп', shape: 'Форма свайпа', trinket: 'Тринкет' } as const;
    let done = false;
    const finish = (el: HTMLElement | null, fn: () => void) => {
      if (done) return;
      done = true;
      sfx.play('card', 1, 1.4);
      if (el) el.classList.add('picked');
      cards.classList.add('closing');
      setTimeout(() => { wrap.classList.add('hidden'); cards.classList.remove('closing'); fn(); }, 220);
    };
    choices.forEach((c, i) => {
      const cur = levels[c.id] ?? 0, next = cur + 1;
      const pips = Array.from({ length: c.max }, (_, k) => `<i class="${k < cur ? 'on' : k === cur ? 'next' : ''}"></i>`).join('');
      const syns = synergiesOf(c.id).map((sy) => {
        const other = byId(sy.a === c.id ? sy.b : sy.a)!;
        const have = (levels[other.id] ?? 0) > 0;
        return `<div class="synline ${have ? 'ready' : ''}">🔗 + ${other.icon} ${other.name} → <b>${sy.icon} ${sy.name}</b></div>`;
      }).join('');
      const slot = slotOf(c.kind);
      const badge = cur === 0 ? `<span class="new">новое · слот ${used[slot] + 1}/${SLOTS[slot]}</span>` : `<span class="up">ур. ${next}</span>`;
      const b = document.createElement('button');
      b.className = `card ${c.kind}`;
      b.style.animationDelay = `${i * 0.06}s`;
      b.innerHTML = `<div class="ctop"><span class="icon">${c.icon}</span><span class="tag">${KIND[c.kind]}</span>${badge}</div>
        <div class="name">${c.name}</div><div class="pips">${pips}</div>
        <div class="desc">${c.desc(next)}</div>${syns}`;
      // небольшая задержка, чтобы случайный свайп не выбрал карту сразу
      b.disabled = true;
      setTimeout(() => (b.disabled = false), 350);
      b.addEventListener('click', () => finish(b, () => o.onPick(c.id)));
      cards.appendChild(b);
      setTimeout(() => sfx.play('card', 0.7, 1 + i * 0.15), i * 60);
    });
    const rr = $('lu-reroll') as HTMLButtonElement, sk = $('lu-skip') as HTMLButtonElement;
    rr.textContent = `🎲 Реролл (${o.rerolls})`;
    rr.disabled = o.rerolls <= 0;
    rr.onclick = () => { if (done || o.rerolls <= 0) return; done = true; sfx.play('reroll'); o.onReroll(); };
    sk.onclick = () => finish(null, o.onSkip);
    $('build').innerHTML = this.buildHtml(levels);
    wrap.classList.remove('hidden');
  }

  /** Сборка: слоты, предметы с уровнями и активные синергии. */
  buildHtml(levels: Levels) {
    const used = slotsUsed(levels);
    const chip = (u: UpgradeDef) => `<span title="${u.name}">${u.icon}<sub>${levels[u.id]}</sub></span>`;
    const owned = UPGRADES.filter((u) => levels[u.id]);
    const blade = owned.filter((u) => u.kind !== 'trinket');
    const trink = owned.filter((u) => u.kind === 'trinket');
    const syn = activeSynergies(levels);
    return `<div><b>Клинок ${used.blade}/${SLOTS.blade}</b> ${blade.map(chip).join('') || '—'}</div>
      <div><b>Тринкеты ${used.trinket}/${SLOTS.trinket}</b> ${trink.map(chip).join('') || '—'}</div>
      ${syn.length ? `<div class="bsyn"><b>Синергии</b> ${syn.map((x) => `${x.icon} ${x.name}`).join(' · ')}</div>` : ''}`;
  }

  showEnd(o: { title: string; text: string; primary: { label: string; fn: () => void } | null; secondary: { label: string; fn: () => void }; win?: boolean }) {
    const el = $('end');
    $('end-title').textContent = o.title;
    $('end-title').className = o.win ? 'win' : '';
    $('end-stats').innerHTML = o.text;
    const b1 = $('end-primary') as HTMLButtonElement, b2 = $('end-secondary') as HTMLButtonElement;
    b1.classList.toggle('hidden', !o.primary);
    b1.textContent = o.primary?.label ?? ''; b2.textContent = o.secondary.label;
    b1.disabled = b2.disabled = true;
    setTimeout(() => (b1.disabled = b2.disabled = false), 600);
    b1.onclick = () => { el.classList.add('hidden'); o.primary?.fn(); };
    b2.onclick = () => { el.classList.add('hidden'); o.secondary.fn(); };
    el.classList.remove('hidden');
  }
}
