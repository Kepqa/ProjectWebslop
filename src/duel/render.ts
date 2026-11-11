/**
 * Отрисовка дуэли на Canvas 2D. Бойцы — процедурные «куклы» с позами под каждое состояние,
 * без спрайтов. Мир W×H вписывается в экран; на широких экранах фон тянется вбок.
 */
import { type Fighter, type Game, GROUND, H, W } from './game';

interface Pose { lean: number; crouch: number; legF: number; legB: number; armF: number; armB: number; wep: number; spin: number; lie: number }
interface Tip { x: number; y: number }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  s = 1; ox = 0; oy = 0; cw = 0; ch = 0; dpr = 1;
  private trails = new Map<Fighter, Tip[]>();
  private shownHp = new Map<Fighter, number>();
  /** подписи клавиш под заклинаниями (для ПК) */
  keyHints: [string[], string[]] = [[], []];
  hudTop = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.cw = innerWidth; this.ch = innerHeight;
    this.canvas.width = Math.round(this.cw * this.dpr); this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = `${this.cw}px`; this.canvas.style.height = `${this.ch}px`;
    const portrait = this.ch > this.cw * 1.05;
    this.s = Math.min(this.cw / W, this.ch / H);
    this.ox = (this.cw - W * this.s) / 2;
    this.oy = portrait ? Math.max(60, this.ch * 0.16) : (this.ch - H * this.s) / 2;
  }

  /** экранные координаты → мировые (для отладки и меню) */
  get worldLeft() { return -this.ox / this.s; }
  get worldRight() { return (this.cw - this.ox) / this.s; }

  draw(g: Game | null, menuT: number) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#120a14'; c.fillRect(0, 0, this.cw, this.ch);
    const sh = g ? g.shake : 0;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    c.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * (this.ox + sx), this.dpr * (this.oy + sy));
    this.background(g ? g.time : menuT);
    if (!g) return;
    for (const s of g.strikes) this.strike(s.x, s.t, s.hit ? (s.flash ?? 0) : -1);
    // сначала тот, кто «сзади» (не атакует)
    const order = [...g.f].sort((a, b) => Number(a.busy) - Number(b.busy));
    for (const f of order) this.fighter(f, g.time);
    for (const s of g.shots) this.shot(s.x, s.y, s.kind, s.vx, g.time);
    for (const r of g.rings) {
      const k = 1 - r.life / 0.45;
      c.strokeStyle = r.color; c.globalAlpha = 1 - k; c.lineWidth = 4 * (1 - k) + 1;
      c.beginPath(); c.arc(r.x, r.y, r.r * (0.3 + k), 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    for (const p of g.parts) {
      c.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center'; c.font = 'bold 22px system-ui, sans-serif';
    for (const t of g.texts) {
      c.globalAlpha = Math.min(1, t.life * 2);
      c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(t.text, t.x, t.y); c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
    this.hud(g);
  }

  // ---------- фон ----------
  private background(t: number) {
    const c = this.ctx;
    const L = this.worldLeft - 20, R = this.worldRight + 20;
    const top = -this.oy / this.s - 20, bottom = (this.ch - this.oy) / this.s + 20;
    const sky = c.createLinearGradient(0, top, 0, GROUND);
    sky.addColorStop(0, '#1d1033'); sky.addColorStop(0.55, '#6a2c5a'); sky.addColorStop(1, '#e07a4f');
    c.fillStyle = sky; c.fillRect(L, top, R - L, GROUND - top);
    // солнце
    const sun = c.createRadialGradient(W / 2, 300, 10, W / 2, 300, 200);
    sun.addColorStop(0, '#ffe3a1'); sun.addColorStop(0.35, '#ffb36b99'); sun.addColorStop(1, '#ffb36b00');
    c.fillStyle = sun; c.fillRect(W / 2 - 220, 80, 440, 400);
    c.fillStyle = '#ffd98f'; c.beginPath(); c.arc(W / 2, 300, 62, 0, Math.PI * 2); c.fill();
    // звёзды
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = L + ((i * 197) % (R - L)), y = top + ((i * 71) % 160);
      c.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + i);
      c.fillRect(x, y, 2, 2);
    }
    c.globalAlpha = 1;
    // горы, три слоя
    const layer = (base: number, amp: number, freq: number, color: string, seed: number) => {
      c.fillStyle = color; c.beginPath(); c.moveTo(L, GROUND);
      for (let x = L; x <= R; x += 16) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(x * freq + seed)) * (0.6 + 0.4 * Math.sin(x * freq * 2.7 + seed * 3));
        c.lineTo(x, y);
      }
      c.lineTo(R, GROUND); c.closePath(); c.fill();
    };
    layer(360, 120, 0.006, '#4a2246', 1);
    layer(400, 80, 0.011, '#341830', 4);
    // храм: колонны по бокам
    c.fillStyle = '#231020';
    for (const x of [L + 40, 70, 210, W - 210, W - 70, R - 40]) {
      c.fillRect(x - 16, 250, 32, GROUND - 250);
      c.fillRect(x - 24, 240, 48, 14); c.fillRect(x - 24, GROUND - 14, 48, 14);
    }
    c.fillRect(L, 222, 280 - L, 20); c.fillRect(W - 280, 222, R - W + 280, 20);
    // факелы на колоннах
    for (const x of [210, W - 210]) {
      const fl = 1 + 0.15 * Math.sin(t * 17 + x) + 0.1 * Math.sin(t * 29);
      const glow = c.createRadialGradient(x, 300, 2, x, 300, 70 * fl);
      glow.addColorStop(0, '#ffcf6bcc'); glow.addColorStop(1, '#ff8a3d00');
      c.fillStyle = glow; c.fillRect(x - 80, 220, 160, 160);
      c.fillStyle = '#ffd36b'; c.beginPath(); c.ellipse(x, 296, 6 * fl, 12 * fl, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#231020'; c.fillRect(x - 8, 304, 16, 8);
    }
    // пол
    const floor = c.createLinearGradient(0, GROUND, 0, bottom);
    floor.addColorStop(0, '#4b2a35'); floor.addColorStop(0.15, '#2e1820'); floor.addColorStop(1, '#120a10');
    c.fillStyle = floor; c.fillRect(L, GROUND, R - L, bottom - GROUND);
    c.strokeStyle = '#ffffff14'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(L, GROUND + 1); c.lineTo(R, GROUND + 1); c.stroke();
    c.strokeStyle = '#00000040';
    for (let x = Math.floor(L / 80) * 80; x < R; x += 80) { c.beginPath(); c.moveTo(x, GROUND + 4); c.lineTo(W / 2 + (x - W / 2) * 1.6, bottom); c.stroke(); }
  }

  // ---------- бойцы ----------
  private pose(f: Fighter, t: number): Pose {
    const p: Pose = { lean: 0, crouch: 0, legF: 0.18, legB: -0.18, armF: 0.9, armB: 0.5, wep: -0.5, spin: 0, lie: 0 };
    const breathe = Math.sin(t * 3.2 + f.side) * 1.5;
    p.crouch = 4 + breathe;
    const ease = (k: number) => k * k * (3 - 2 * k);
    switch (f.act) {
      case 'walk': {
        const s = Math.sin(f.walkPhase);
        p.legF = s * 0.55; p.legB = -s * 0.55; p.crouch = 3 + Math.abs(Math.cos(f.walkPhase)) * 3; p.armB = 0.5 - s * 0.3; p.lean = 0.08;
        break;
      }
      case 'air':
        p.legF = 0.7; p.legB = -0.1; p.crouch = 0; p.armB = 1.4; p.armF = 1.2; p.wep = 0;
        break;
      case 'block':
        p.armF = 1.55; p.wep = -1.35; p.armB = 1.5; p.crouch = 10; p.lean = -0.05; p.legF = 0.35; p.legB = -0.35;
        break;
      case 'light': case 'heavy': {
        const m = f.move!; const k = f.act === 'light' ? 1 / f.hero.lightSpeed : 1;
        const su = m.startup * k, ac = m.active * k, re = m.recovery * k;
        const heavy = f.act === 'heavy';
        const alt = f.act === 'light' && f.combo === 1;
        const from = heavy ? 3.1 : alt ? 0.2 : 2.5, to = heavy ? 0.5 : alt ? 2.3 : 1.0;
        let a: number;
        if (f.t < su) a = 0.9 + (from - 0.9) * ease(f.t / su);
        else if (f.t < su + ac) a = from + (to - from) * ease((f.t - su) / ac);
        else a = to + (0.9 - to) * ease(Math.min(1, (f.t - su - ac) / re));
        p.armF = a; p.wep = a - Math.PI / 2 - (heavy ? 0.2 : 0);
        p.lean = f.t < su ? (heavy ? -0.18 : -0.05) : 0.22;
        p.legF = 0.45; p.legB = -0.4; p.crouch = heavy ? 12 : 8;
        if (f.y < GROUND - 1) { p.legF = 0.8; p.legB = 0.1; }
        break;
      }
      case 'dodge':
        p.spin = (f.t / 0.36) * Math.PI * 2 * (Math.sign(f.vx) === f.facing ? 1 : -1);
        p.crouch = 34; p.legF = 1.2; p.legB = 0.9; p.armF = 1.4; p.armB = 1.4; p.wep = 0.2;
        break;
      case 'dash':
        p.lean = 0.5; p.armF = 1.6; p.wep = 0; p.armB = 1.6; p.legF = 0.7; p.legB = -0.9; p.crouch = 14;
        break;
      case 'cast':
        p.armF = 2.0 + Math.sin(t * 20) * 0.05; p.armB = 2.1; p.wep = 0.6; p.lean = -0.06; p.crouch = 8;
        break;
      case 'hurt':
        p.lean = -0.4; p.armF = 0.4; p.armB = 0.9; p.wep = 0.6; p.legF = 0.3; p.legB = -0.1;
        break;
      case 'stun':
        p.lean = -0.2 + Math.sin(t * 6) * 0.15; p.armF = 0.2; p.armB = 0.2; p.wep = 1.2; p.crouch = 14;
        break;
      case 'ko':
        p.lie = Math.min(1, f.t * 2.5); p.lean = -0.3; p.armF = 2.6; p.armB = 2.4; p.wep = 1.6; p.legF = 0.2; p.legB = -0.2;
        break;
    }
    return p;
  }

  private fighter(f: Fighter, t: number) {
    const c = this.ctx, h = f.hero, p = this.pose(f, t);
    // тень
    c.fillStyle = '#00000055';
    const air = Math.max(0, GROUND - f.y);
    c.beginPath(); c.ellipse(f.x, GROUND + 3, 34 - air * 0.06, 7, 0, 0, Math.PI * 2); c.fill();

    c.save();
    c.translate(f.x, f.y);
    c.scale(f.facing, 1);
    if (p.lie) { c.translate(-30 * p.lie, 0); c.rotate(-p.lie * Math.PI / 2); }
    const hipY = -52 + p.crouch;
    if (p.spin) { c.translate(0, hipY - 6); c.rotate(p.spin); c.translate(0, -(hipY - 6)); }

    const flash = f.flash > 0;
    const blink = f.invuln > 0 && f.act !== 'dash' && Math.floor(t * 30) % 2 === 0;
    if (blink) c.globalAlpha = 0.55;
    const body = flash ? '#ffffff' : h.body, trim = flash ? '#ffffff' : h.trim, skin = flash ? '#ffffff' : h.skin;
    const dark = flash ? '#eeeeee' : shade(h.body, -0.35);

    // ауры
    if (f.buff > 0) this.aura(0, hipY - 30, '#ff6b5a', t);
    if (f.venom > 0) this.aura(0, hipY - 30, '#9dff5a', t);
    if (f.act === 'cast') this.aura(0, hipY - 30, h.accent, t * 2);

    const lean = p.lean;
    const sh = { x: Math.sin(lean) * 50, y: hipY - Math.cos(lean) * 50 };
    // ноги
    const leg = (a: number, col: string) => {
      const knee = { x: Math.sin(a) * 26 + 4, y: hipY + Math.cos(a) * 26 };
      const foot = { x: knee.x + Math.sin(a * 0.4) * 24 - 2, y: Math.min(0, knee.y + 26) };
      limb(c, [{ x: 0, y: hipY }, knee, foot], 11, col);
      c.fillStyle = shade(col, -0.3); c.fillRect(foot.x - 6, foot.y - 5, 16, 7);
    };
    leg(p.legB, dark);
    // задняя рука (у рыцаря — щит)
    const armB = arm(sh.x - 4, sh.y + 4, p.armB, 22, 20);
    limb(c, [{ x: sh.x - 4, y: sh.y + 4 }, armB.elbow, armB.hand], 8, dark);
    if (h.id === 'rogue') this.dagger(armB.hand.x, armB.hand.y, p.wep + 0.3, trim);
    if (h.id === 'knight' && f.act !== 'block') this.shield(armB.hand.x, armB.hand.y, body, trim);
    leg(p.legF, body);

    // торс
    c.save(); c.translate(0, hipY); c.rotate(lean);
    c.fillStyle = body; roundRect(c, -15, -54, 30, 58, 10); c.fill();
    c.fillStyle = trim; c.fillRect(-15, -6, 30, 6);
    if (h.id === 'mage') { c.fillStyle = body; c.beginPath(); c.moveTo(-16, -6); c.lineTo(16, -6); c.lineTo(22, 34 - p.crouch); c.lineTo(-22, 34 - p.crouch); c.closePath(); c.fill(); c.fillStyle = trim; c.fillRect(-2, -50, 4, 46); }
    if (h.id === 'knight') { c.fillStyle = trim; c.fillRect(-15, -54, 30, 8); c.fillStyle = shade(h.body, 0.25); roundRect(c, -10, -44, 20, 30, 6); c.fill(); }
    if (h.id === 'rogue') { c.strokeStyle = trim; c.lineWidth = 3; c.beginPath(); c.moveTo(-15, -50); c.lineTo(15, -10); c.stroke(); }
    // голова
    c.translate(0, -68);
    c.fillStyle = skin; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
    this.head(h.id, body, trim, f, t);
    c.restore();

    // передняя рука с оружием
    const armF = arm(sh.x + 4, sh.y + 4, p.armF, 22, 22);
    limb(c, [{ x: sh.x + 4, y: sh.y + 4 }, armF.elbow, armF.hand], 9, body);
    const tip = this.weapon(h.id, armF.hand.x, armF.hand.y, p.wep, trim, h.accent, t, f.act === 'cast');
    if (h.id === 'knight' && f.act === 'block') this.shield(sh.x + 26, sh.y + 22, body, trim, 1.25);
    c.fillStyle = skin; c.beginPath(); c.arc(armF.hand.x, armF.hand.y, 5, 0, Math.PI * 2); c.fill();
    c.restore();
    c.globalAlpha = 1;

    // след клинка в момент удара
    const trail = this.trails.get(f) ?? [];
    const active = (f.act === 'light' || f.act === 'heavy') && f.phase === 1;
    if (active) {
      trail.push({ x: f.x + tip.x * f.facing, y: f.y + tip.y });
      if (trail.length > 7) trail.shift();
    } else if (trail.length) trail.shift();
    this.trails.set(f, trail);
    if (trail.length > 1) {
      c.strokeStyle = f.act === 'heavy' ? '#ffd27a' : '#ffffff';
      c.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        c.globalAlpha = (i / trail.length) * 0.8; c.lineWidth = (i / trail.length) * (f.act === 'heavy' ? 14 : 9);
        c.beginPath(); c.moveTo(trail[i - 1].x, trail[i - 1].y); c.lineTo(trail[i].x, trail[i].y); c.stroke();
      }
      c.globalAlpha = 1;
    }

    // оглушение — звёздочки
    if (f.act === 'stun') {
      c.fillStyle = '#ffe36b';
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        c.beginPath(); c.arc(f.x + Math.cos(a) * 22, f.y - 150 + Math.sin(a) * 6, 4, 0, Math.PI * 2); c.fill();
      }
    }
  }

  private head(id: string, body: string, trim: string, f: Fighter, t: number) {
    const c = this.ctx;
    if (id === 'knight') {
      c.fillStyle = shade(body, 0.15); c.beginPath(); c.arc(0, -2, 17, Math.PI, 0); c.lineTo(17, 10); c.lineTo(-17, 10); c.closePath(); c.fill();
      c.fillStyle = '#111'; c.fillRect(2, -3, 15, 4);
      c.fillStyle = '#d9473d'; c.beginPath(); c.moveTo(-4, -18); c.quadraticCurveTo(-24, -26 + Math.sin(t * 4) * 2, -30, -8); c.lineTo(-6, -14); c.fill();
    } else if (id === 'mage') {
      c.fillStyle = '#222'; c.fillRect(5, -3, 4, 4);
      c.fillStyle = '#eee'; c.beginPath(); c.moveTo(-2, 8); c.quadraticCurveTo(8, 30, 14, 6); c.fill();
      c.fillStyle = body; c.beginPath(); c.moveTo(-24, -6); c.lineTo(24, -6); c.lineTo(-10, -48 + Math.sin(t * 2) * 2); c.closePath(); c.fill();
      c.fillStyle = trim; c.fillRect(-18, -10, 36, 5);
    } else {
      c.fillStyle = body; c.beginPath(); c.arc(-1, -1, 17, Math.PI * 0.75, Math.PI * 2.25); c.fill();
      c.fillStyle = '#111'; c.fillRect(-2, 1, 18, 9);
      c.fillStyle = f.hero.accent; c.fillRect(6, -4, 6, 3);
      // шарф развевается
      c.strokeStyle = trim; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-10, 12);
      c.quadraticCurveTo(-30, 14 + Math.sin(t * 9) * 5, -46 - Math.abs(f.vx) * 0.03, 8 + Math.sin(t * 11) * 7); c.stroke();
    }
  }

  /** оружие в руке; возвращает кончик в локальных координатах */
  private weapon(id: string, x: number, y: number, a: number, trim: string, accent: string, t: number, casting: boolean): Tip {
    const c = this.ctx;
    const dx = Math.cos(a), dy = Math.sin(a);
    if (id === 'knight') {
      const L = 66;
      c.strokeStyle = '#e8edf5'; c.lineWidth = 6; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * L, y + dy * L); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + dx * 8, y + dy * 8); c.lineTo(x + dx * (L - 4), y + dy * (L - 4)); c.stroke();
      c.strokeStyle = trim; c.lineWidth = 5; c.beginPath(); c.moveTo(x - dy * 10, y + dx * 10); c.lineTo(x + dy * 10, y - dx * 10); c.stroke();
      return { x: x + dx * L, y: y + dy * L };
    }
    if (id === 'mage') {
      const L = 54, B = 34;
      c.strokeStyle = '#7a4a2a'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - dx * B, y - dy * B); c.lineTo(x + dx * L, y + dy * L); c.stroke();
      const ox = x + dx * (L + 6), oy = y + dy * (L + 6);
      const r = casting ? 11 + Math.sin(t * 25) * 2 : 8;
      const g = c.createRadialGradient(ox, oy, 1, ox, oy, r * 3);
      g.addColorStop(0, '#fff5d0'); g.addColorStop(0.3, accent); g.addColorStop(1, accent + '00');
      c.fillStyle = g; c.beginPath(); c.arc(ox, oy, r * 3, 0, Math.PI * 2); c.fill();
      return { x: ox, y: oy };
    }
    this.dagger(x, y, a, trim);
    return { x: x + dx * 40, y: y + dy * 40 };
  }

  private dagger(x: number, y: number, a: number, trim: string) {
    const c = this.ctx, dx = Math.cos(a), dy = Math.sin(a);
    c.strokeStyle = '#d8dde6'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * 38, y + dy * 38); c.stroke();
    c.strokeStyle = trim; c.lineWidth = 4; c.beginPath(); c.moveTo(x - dy * 6, y + dx * 6); c.lineTo(x + dy * 6, y - dx * 6); c.stroke();
  }

  private shield(x: number, y: number, body: string, trim: string, k = 1) {
    const c = this.ctx;
    c.fillStyle = shade(body, 0.1); c.strokeStyle = trim; c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x - 16 * k, y - 24 * k); c.lineTo(x + 16 * k, y - 24 * k); c.lineTo(x + 16 * k, y + 6 * k);
    c.quadraticCurveTo(x, y + 30 * k, x - 16 * k, y + 6 * k); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = trim; c.fillRect(x - 3 * k, y - 18 * k, 6 * k, 30 * k); c.fillRect(x - 12 * k, y - 8 * k, 24 * k, 6 * k);
  }

  private aura(x: number, y: number, color: string, t: number) {
    const c = this.ctx;
    const r = 64 + Math.sin(t * 6) * 6;
    const g = c.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  private shot(x: number, y: number, kind: 'fire' | 'knife', vx: number, t: number) {
    const c = this.ctx;
    if (kind === 'fire') {
      const g = c.createRadialGradient(x, y, 2, x, y, 30);
      g.addColorStop(0, '#fff6c8'); g.addColorStop(0.35, '#ff9a3d'); g.addColorStop(1, '#ff4a1d00');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 30 + Math.sin(t * 30) * 3, 0, Math.PI * 2); c.fill();
    } else {
      c.save(); c.translate(x, y); c.scale(Math.sign(vx), 1);
      c.fillStyle = '#e6e9ef'; c.beginPath(); c.moveTo(16, 0); c.lineTo(-4, -5); c.lineTo(-4, 5); c.closePath(); c.fill();
      c.fillStyle = '#333'; c.fillRect(-14, -2, 10, 4);
      c.strokeStyle = '#ffffff55'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-50, 0); c.stroke();
      c.restore();
    }
  }

  private strike(x: number, t: number, flash: number) {
    const c = this.ctx;
    if (flash < 0) {
      // предупреждение: круг на земле сужается
      const k = Math.max(0, t / 0.6);
      c.strokeStyle = '#bfe3ff'; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 40);
      c.lineWidth = 3; c.beginPath(); c.ellipse(x, GROUND, 46 + k * 30, 9 + k * 5, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.18; c.fillStyle = '#bfe3ff'; c.fillRect(x - 3, 0, 6, GROUND);
      c.globalAlpha = 1;
      return;
    }
    c.globalAlpha = Math.min(1, flash / 0.15);
    c.strokeStyle = '#eaf6ff'; c.lineWidth = 7; c.lineJoin = 'round';
    c.beginPath(); let yy = -20, xx = x; c.moveTo(xx, yy);
    while (yy < GROUND) { yy += 30 + Math.random() * 30; xx = x + (Math.random() - 0.5) * 40; c.lineTo(xx, Math.min(GROUND, yy)); }
    c.stroke();
    c.strokeStyle = '#7fc4ff'; c.lineWidth = 16; c.globalAlpha *= 0.35; c.stroke();
    c.globalAlpha = 1;
  }

  // ---------- HUD ----------
  private hud(g: Game) {
    const c = this.ctx;
    const top = 18 + this.hudTop;
    const bw = 360;
    g.f.forEach((f, i) => {
      const left = i === 0;
      const x0 = left ? 24 : W - 24 - bw;
      const shown = this.shownHp.get(f) ?? f.hp;
      const ns = shown > f.hp ? Math.max(f.hp, shown - 40 * (1 / 60)) : f.hp;
      this.shownHp.set(f, ns);
      // имя и победы
      c.font = 'bold 18px system-ui, sans-serif'; c.textAlign = left ? 'left' : 'right';
      c.lineWidth = 4; c.strokeStyle = '#000a';
      const label = f.hero.name;
      c.strokeText(label, left ? x0 : x0 + bw, top + 12); c.fillStyle = '#fff'; c.fillText(label, left ? x0 : x0 + bw, top + 12);
      for (let w = 0; w < g.roundsToWin; w++) {
        const px = left ? x0 + bw - 10 - w * 22 : x0 + 10 + w * 22;
        c.fillStyle = w < f.wins ? '#ffd36b' : '#0008'; c.strokeStyle = '#000'; c.lineWidth = 2;
        c.beginPath(); c.arc(px, top + 6, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      const bar = (y: number, hgt: number, val: number, max: number, col: string, ghost?: number) => {
        c.fillStyle = '#000b'; roundRect(c, x0 - 2, y - 2, bw + 4, hgt + 4, 5); c.fill();
        const fill = (v: number) => (bw * Math.max(0, v)) / max;
        if (ghost !== undefined) { c.fillStyle = '#ffffffaa'; const gw = fill(ghost); c.fillRect(left ? x0 : x0 + bw - gw, y, gw, hgt); }
        c.fillStyle = col; const w = fill(val); c.fillRect(left ? x0 : x0 + bw - w, y, w, hgt);
      };
      const hpCol = f.hp / f.maxHp < 0.3 ? '#ff4d4d' : '#4fdc6c';
      bar(top + 22, 18, f.hp, f.maxHp, hpCol, ns);
      bar(top + 46, 6, f.stamina, 100, f.stamina < 22 ? '#a07a3a' : '#ffd36b');
      bar(top + 57, 8, f.mana, 100, '#5aa8ff');
      if (f.poison > 0) { c.fillStyle = '#9dff5a'; c.font = 'bold 14px system-ui'; c.fillText('☠', left ? x0 + bw + 14 : x0 - 14, top + 36); }
      // заклинания
      f.hero.spells.forEach((s, k) => {
        const sz = 34, gap = 6;
        const sx = left ? x0 + k * (sz + gap) : x0 + bw - sz - k * (sz + gap), sy = top + 72;
        const ready = f.cds[k] <= 0 && f.mana >= s.mana;
        c.fillStyle = ready ? '#ffffff22' : '#00000088'; roundRect(c, sx, sy, sz, sz, 7); c.fill();
        c.strokeStyle = ready ? f.hero.accent : '#ffffff30'; c.lineWidth = 2; c.stroke();
        c.globalAlpha = ready ? 1 : 0.45; c.fillStyle = '#fff';
        c.font = '20px system-ui'; c.textAlign = 'center'; c.fillText(s.icon, sx + sz / 2, sy + 25);
        c.globalAlpha = 1;
        if (f.cds[k] > 0) {
          c.fillStyle = '#000a'; c.beginPath(); c.moveTo(sx + sz / 2, sy + sz / 2);
          c.arc(sx + sz / 2, sy + sz / 2, sz / 2 - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (f.cds[k] / s.cd)); c.closePath(); c.fill();
        }
        const hint = this.keyHints[i][k];
        if (hint) { c.font = 'bold 10px system-ui'; c.fillStyle = '#fffc'; c.fillText(hint, sx + sz / 2, sy + sz + 11); }
        c.textAlign = left ? 'left' : 'right';
      });
    });
    // таймер
    c.textAlign = 'center'; c.font = 'bold 38px system-ui, sans-serif';
    c.lineWidth = 5; c.strokeStyle = '#000a';
    const tm = String(Math.ceil(g.timer));
    c.strokeText(tm, W / 2, top + 50); c.fillStyle = g.timer < 10 ? '#ff7a6b' : '#fff'; c.fillText(tm, W / 2, top + 50);
    c.font = '13px system-ui'; c.fillStyle = '#fffa'; c.fillText(`Раунд ${g.round}`, W / 2, top + 70);
    // баннер
    if (g.bannerT > 0) {
      const k = Math.min(1, g.bannerT * 3);
      c.globalAlpha = k;
      c.font = `900 ${Math.round(72 + (1 - k) * 20)}px system-ui, sans-serif`;
      c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText(g.banner, W / 2, 250);
      c.fillStyle = g.banner === 'K.O.' ? '#ff5a4a' : '#ffe9a8'; c.fillText(g.banner, W / 2, 250);
      c.globalAlpha = 1;
    }
  }
}

// ---------- утилиты ----------
function arm(x: number, y: number, a: number, l1: number, l2: number) {
  // a: 0 — рука вниз, π/2 — вперёд, π — вверх
  const ex = x + Math.sin(a) * l1, ey = y + Math.cos(a) * l1;
  const b = a + 0.35;
  return { elbow: { x: ex, y: ey }, hand: { x: ex + Math.sin(b) * l2, y: ey + Math.cos(b) * l2 } };
}
function limb(c: CanvasRenderingContext2D, pts: Tip[], w: number, col: string) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke();
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

