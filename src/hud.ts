import { UPGRADES, type Levels, type UpgradeDef } from './upgrades';

const $ = (id: string) => document.getElementById(id)!;

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
  private voteTimer = 0;

  constructor() {
    $('pause').onclick = () => this.onPause();
  }

  show(coop = false) {
    $('hud').classList.remove('hidden');
    $('hud').classList.toggle('coop', coop);
    for (const id of ['levelup', 'end']) $(id).classList.add('hidden');
    this.closeModals();
  }

  closeModals() {
    for (const id of ['pause-ov', 'vote', 'wait', 'countdown']) $(id).classList.add('hidden');
    clearInterval(this.voteTimer);
  }

  showPause(onResume: () => void, onExit: () => void, note = '') {
    $('pause-note').textContent = note;
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

  /** Джойстик в CSS-пикселях. mode: 'active' — зажат, 'hint' — подсказка, null — скрыт. */
  setJoystick(mode: 'active' | 'hint' | null, bx = 0, by = 0, kx = 0, ky = 0, R = 60) {
    const st = `${mode}|${bx | 0}|${by | 0}|${kx | 0}|${ky | 0}|${R | 0}`;
    if (st === this.joyState) return;
    this.joyState = st;
    if (!mode) { this.joyBase.style.display = 'none'; this.joyKnob.style.display = 'none'; return; }
    this.joyBase.style.display = 'block';
    this.joyBase.className = mode;
    Object.assign(this.joyBase.style, { left: `${bx - R}px`, top: `${by - R}px`, width: `${R * 2}px`, height: `${R * 2}px` });
    if (mode === 'active') {
      const k = R * 0.45;
      this.joyKnob.style.display = 'block';
      Object.assign(this.joyKnob.style, { left: `${kx - k}px`, top: `${ky - k}px`, width: `${k * 2}px`, height: `${k * 2}px` });
    } else this.joyKnob.style.display = 'none';
  }

  update(s: { hp: number; maxHp: number; energy: number; energyMax: number; xp: number; xpNext: number; time: number; total: number; kills: number; level: number }) {
    const key = [Math.ceil(s.hp), s.maxHp, Math.round(s.energy), s.energyMax, Math.floor(s.xp), s.xpNext, Math.floor(s.time), s.kills, s.level].join('|');
    if (key === this.last) return;
    this.last = key;
    this.hpFill.style.width = `${Math.max(0, s.hp / s.maxHp) * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.ceil(s.hp))} / ${s.maxHp}`;
    this.energyFill.style.width = `${(s.energy / s.energyMax) * 100}%`;
    this.xpFill.style.width = `${Math.min(1, s.xp / s.xpNext) * 100}%`;
    const t = Math.floor(s.time);
    const f = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    this.timeEl.textContent = `${f(t)} / ${f(Math.floor(s.total))}`;
    this.timeEl.classList.toggle('final', s.total - t <= 90);
    this.killsEl.textContent = String(s.kills);
    this.levelEl.textContent = String(s.level);
  }

  energyEmpty() {
    this.energyBar.classList.remove('empty');
    void this.energyBar.offsetWidth;
    this.energyBar.classList.add('empty');
  }

  setItems(levels: Levels) {
    this.itemsEl.innerHTML = UPGRADES.filter((u) => levels[u.id])
      .map((u) => `<span title="${u.name}">${u.icon}<sub>${levels[u.id]}</sub></span>`).join('');
  }

  toast(msg: string, ms = 1600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showLevelUp(choices: UpgradeDef[], levels: Levels, onPick: (id: string) => void) {
    const wrap = $('levelup');
    const cards = $('cards');
    cards.innerHTML = '';
    for (const c of choices) {
      const next = (levels[c.id] ?? 0) + 1;
      const b = document.createElement('button');
      b.className = `card ${c.kind}`;
      b.innerHTML = `<div class="icon">${c.icon}</div><div class="name">${c.name}</div>
        <div class="lvl">${c.kind === 'trinket' ? 'Тринкет' : 'Свайп'} · ${next === 1 ? 'новое' : 'ур. ' + next}</div>
        <div>${c.desc(next)}</div>`;
      // Небольшая задержка, чтобы случайный свайп не выбрал карту сразу
      b.disabled = true;
      setTimeout(() => (b.disabled = false), 350);
      b.addEventListener('click', () => { wrap.classList.add('hidden'); onPick(c.id); });
      cards.appendChild(b);
    }
    wrap.classList.remove('hidden');
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
