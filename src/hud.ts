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

  show() { $('hud').classList.remove('hidden'); }

  update(s: { hp: number; maxHp: number; energy: number; energyMax: number; xp: number; xpNext: number; time: number; kills: number; level: number }) {
    const key = [Math.ceil(s.hp), s.maxHp, Math.round(s.energy), s.energyMax, Math.floor(s.xp), s.xpNext, Math.floor(s.time), s.kills, s.level].join('|');
    if (key === this.last) return;
    this.last = key;
    this.hpFill.style.width = `${Math.max(0, s.hp / s.maxHp) * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.ceil(s.hp))} / ${s.maxHp}`;
    this.energyFill.style.width = `${(s.energy / s.energyMax) * 100}%`;
    this.xpFill.style.width = `${Math.min(1, s.xp / s.xpNext) * 100}%`;
    const t = Math.floor(s.time);
    this.timeEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
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

  showGameOver(text: string, onRestart: () => void) {
    $('go-stats').innerHTML = text;
    $('gameover').classList.remove('hidden');
    $('restart-btn').onclick = () => { $('gameover').classList.add('hidden'); onRestart(); };
  }
}
