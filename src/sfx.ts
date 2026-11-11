/**
 * Процедурные звуки на WebAudio (без файлов).
 * Защита от перегруза при толпах:
 *  - у каждого звука минимальный интервал и лимит одновременных голосов;
 *  - громкость частых звуков падает с плотностью событий;
 *  - всё идёт через компрессор/лимитер.
 * Плюс непрерывный «голос» свайпа, который живёт, пока палец режет.
 */
export type SfxName =
  | 'swipe' | 'hit' | 'kill' | 'pop' | 'gem' | 'chest' | 'level' | 'hurt' | 'explode' | 'rune' | 'boss' | 'jump' | 'land'
  | 'crate' | 'spit' | 'clank' | 'fall' | 'win' | 'lose' | 'fuse' | 'slice' | 'zap' | 'throw' | 'bell'
  | 'heal' | 'charge' | 'spear' | 'wave' | 'synergy' | 'reroll' | 'card' | 'dull' | 'loop' | 'chestopen' | 'reveal';

interface Lim { gap: number; voices: number }

const LIMITS: Record<SfxName, Lim> = {
  swipe: { gap: 0.06, voices: 2 }, hit: { gap: 0.03, voices: 3 }, kill: { gap: 0.04, voices: 3 }, pop: { gap: 0.035, voices: 4 },
  gem: { gap: 0.04, voices: 3 }, chest: { gap: 0.3, voices: 1 }, level: { gap: 0.5, voices: 1 },
  hurt: { gap: 0.15, voices: 1 }, explode: { gap: 0.09, voices: 2 }, rune: { gap: 0.2, voices: 1 },
  boss: { gap: 1, voices: 1 }, jump: { gap: 0.12, voices: 2 }, land: { gap: 0.1, voices: 2 },
  crate: { gap: 0.06, voices: 2 }, spit: { gap: 0.15, voices: 2 }, clank: { gap: 0.06, voices: 2 },
  fall: { gap: 0.12, voices: 2 }, win: { gap: 1, voices: 1 }, lose: { gap: 1, voices: 1 },
  fuse: { gap: 0.2, voices: 2 }, slice: { gap: 0.05, voices: 2 }, zap: { gap: 0.06, voices: 2 },
  throw: { gap: 0.1, voices: 1 }, bell: { gap: 0.5, voices: 1 }, heal: { gap: 0.2, voices: 1 },
  charge: { gap: 0.2, voices: 1 }, spear: { gap: 0.08, voices: 2 }, wave: { gap: 0.15, voices: 1 },
  synergy: { gap: 1, voices: 1 }, reroll: { gap: 0.15, voices: 1 }, card: { gap: 0.05, voices: 2 },
  dull: { gap: 0.2, voices: 1 }, loop: { gap: 0.12, voices: 2 }, chestopen: { gap: 0.4, voices: 1 }, reveal: { gap: 0.3, voices: 1 },
};

/** Мажорная пентатоника в полутонах: серии убийств и сбор опыта звучат восходящей мелодией, а не сиреной. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
const penta = (step: number) => Math.pow(2, PENTA[Math.max(0, Math.min(PENTA.length - 1, step))] / 12);

interface Loop { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode; osc: OscillatorNode; og: GainNode }

class Sfx {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<SfxName, number>();
  private voices = new Map<SfxName, number>();
  private recent = new Map<SfxName, number[]>();
  private loops = new Map<number, Loop>();
  private gemPitch = 0; private gemAt = 0;
  private htmlUnlocked = false;
  muted = false;
  musicOn = true;
  /** куда сейчас пишут tone/hiss (музыка идёт в свою шину) */
  private bus: AudioNode | null = null;
  private mGain: GainNode | null = null; private mFilt: BiquadFilterNode | null = null;
  private mTimer = 0; private mNext = 0; private mStep = 0; private mLevel = 0; private mTarget = 0; private mBoss = false;

  constructor() {
    try { this.muted = localStorage.getItem('ss_muted') === '1'; this.musicOn = localStorage.getItem('ss_music') !== '0'; } catch { /* приватный режим */ }
  }

  /**
   * Вызывать из обработчика click/touchend/keydown — iOS разрешает звук только внутри такого жеста.
   * Ставим аудиосессию в режим playback, чтобы звук шёл и в беззвучном режиме iPhone/iPad.
   */
  unlock() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* старый Safari */ }
    if (!this.htmlUnlocked) {
      this.htmlUnlocked = true;
      try {
        const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        a.setAttribute('playsinline', ''); a.volume = 0.01;
        void a.play().catch(() => { this.htmlUnlocked = false; });
      } catch { /* ignore */ }
    }
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.12;
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.6;
      this.out.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination); src.start(0);
    } catch { /* ignore */ }
  }

  get state() { return this.ctx?.state ?? 'none'; }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('ss_muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
    if (m) for (const id of [...this.loops.keys()]) this.swipeEnd(id);
  }

  // ---------- Непрерывный звук свайпа ----------
  /** Начало свайпа: тихий «шелест» + свист, громкость и тон потом идут за скоростью пальца. */
  swipeStart(id: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running' || this.loops.size >= 2 || this.loops.has(id)) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.Q.value = 1.6; filt.frequency.value = 900;
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 260;
    const og = ctx.createGain(); og.gain.value = 0.0001;
    src.connect(filt).connect(gain).connect(this.out);
    osc.connect(og).connect(this.out);
    src.start(t, Math.random()); osc.start(t);
    this.loops.set(id, { src, filt, gain, osc, og });
  }

  /** speed — CSS px/мс; blade — режет ли сейчас (иначе тише и глуше). */
  swipeUpdate(id: number, speed: number, blade: boolean) {
    const ctx = this.ctx, l = this.loops.get(id);
    if (!ctx || !l) return;
    const t = ctx.currentTime;
    const k = Math.max(0, Math.min(1, (speed - 0.15) / 1.8));
    const g = blade ? 0.08 + 0.34 * k : 0.02;
    for (const [p, v] of [[l.gain.gain, g], [l.og.gain, blade ? 0.015 + 0.05 * k : 0.0001]] as const) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, 0.02);
      p.setTargetAtTime(0.0001, t + 0.07, 0.07); // палец замер — звук сам затухает
    }
    l.filt.frequency.setTargetAtTime(blade ? 1100 + 4200 * k : 450, t, 0.025);
    l.osc.frequency.setTargetAtTime(330 + 700 * k, t, 0.04);
  }

  swipeEnd(id: number) {
    const ctx = this.ctx, l = this.loops.get(id);
    if (!ctx || !l) return;
    this.loops.delete(id);
    const t = ctx.currentTime;
    for (const p of [l.gain.gain, l.og.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0.0001, t, 0.04); }
    l.src.stop(t + 0.25); l.osc.stop(t + 0.25);
  }

  /** pitch — множитель высоты (комбо: каждый следующий «чпок» выше). */
  play(name: SfxName, vol = 1, pitch = 1) {
    if (vol <= 0.02) return;
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state !== 'running') { void ctx.resume().catch(() => undefined); return; }
    const t = ctx.currentTime;
    const lim = LIMITS[name];
    if (t - (this.last.get(name) ?? -1) < lim.gap) return;
    if ((this.voices.get(name) ?? 0) >= lim.voices) return;
    const arr = (this.recent.get(name) ?? []).filter((x) => t - x < 0.4);
    arr.push(t); this.recent.set(name, arr);
    const v = vol / Math.sqrt(1 + (arr.length - 1) * 0.6);
    this.last.set(name, t);
    this.voices.set(name, (this.voices.get(name) ?? 0) + 1);
    const dur = this.synth(name, t, v, pitch);
    setTimeout(() => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1)), dur * 1000 + 30);
  }

  // ---------- Музыка: ритм, который собирается из слоёв по мере роста комбо ----------
  setMusic(on: boolean) {
    this.musicOn = on;
    try { localStorage.setItem('ss_music', on ? '1' : '0'); } catch { /* ignore */ }
    if (!on) this.musicStop();
  }

  musicStart() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || this.mTimer) return;
    this.mFilt = ctx.createBiquadFilter(); this.mFilt.type = 'lowpass'; this.mFilt.frequency.value = 9000;
    this.mGain = ctx.createGain(); this.mGain.gain.value = 0.0001;
    this.mFilt.connect(this.mGain).connect(this.out);
    this.mGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8);
    this.mNext = ctx.currentTime + 0.1; this.mStep = 0; this.mLevel = 0; this.mTarget = 0;
    this.mTimer = window.setInterval(() => this.musicTick(), 50);
  }

  musicStop() {
    if (!this.mTimer) return;
    clearInterval(this.mTimer); this.mTimer = 0;
    const g = this.mGain, f = this.mFilt;
    if (g && this.ctx) { g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25); setTimeout(() => { g.disconnect(); f?.disconnect(); }, 1500); }
    this.mGain = null; this.mFilt = null;
  }

  /** combo < 0 — пауза (музыка глуше). Слои: бочка → хэт → бас → арпеджио; босс и «безумие» включают всё. */
  musicMood(combo: number, boss: boolean, frenzy: boolean, hp: number) {
    const ctx = this.ctx;
    if (!ctx || !this.mGain || !this.mFilt) return;
    const paused = combo < 0;
    this.mTarget = paused ? this.mLevel : frenzy ? 4 : Math.max(boss ? 3 : 0, combo >= 100 ? 4 : combo >= 50 ? 3 : combo >= 20 ? 2 : combo >= 6 ? 1 : 0);
    this.mBoss = boss;
    this.mGain.gain.setTargetAtTime(paused ? 0.14 : 0.5, ctx.currentTime, 0.2);
    // мало здоровья — музыка «уходит под воду»
    this.mFilt.frequency.setTargetAtTime(paused ? 700 : hp < 0.3 ? 900 : 9000, ctx.currentTime, 0.25);
  }

  private musicTick() {
    const ctx = this.ctx;
    if (!ctx || !this.mFilt || ctx.state !== 'running') return;
    if (this.muted) { this.mNext = ctx.currentTime + 0.1; return; }
    const stepLen = 60 / 104 / 4;
    if (this.mNext < ctx.currentTime) this.mNext = ctx.currentTime + 0.05;
    this.bus = this.mFilt;
    while (this.mNext < ctx.currentTime + 0.14) {
      const t = this.mNext, i = this.mStep % 32, b = i % 16;
      // уровень меняется только на границе такта: слои входят в долю, а не как попало
      if (b === 0) this.mLevel += Math.sign(this.mTarget - this.mLevel);
      const L = this.mLevel;
      const root = this.mBoss ? 49 : 55; // ля → соль при боссе: темнее
      const bass = [0, 0, 3, 0, 7, 0, 3, -2][(i >> 1) % 8];
      if (b % 8 === 0 || (L >= 1 && b % 4 === 0)) { this.tone(t, 'sine', 125, 42, 0.13, L >= 1 ? 0.5 : 0.28, 0.002); this.hiss(t, 'lowpass', 900, 200, 0.03, 0.12, 1, 0.001); }
      if (L === 0 && b === 0) this.tone(t, 'triangle', root, root, 1.6, 0.16, 0.2);
      if (L >= 2 && b % 4 === 2) this.hiss(t, 'highpass', 8000, 9000, 0.03, 0.1, 0.8, 0.001);
      if (L >= 3 && b % 2 === 1) this.hiss(t, 'highpass', 9500, 9500, 0.015, 0.05, 0.8, 0.001);
      if (L >= 2 && (b === 4 || b === 12)) { this.hiss(t, 'bandpass', 1900, 1300, 0.09, 0.2, 1.4, 0.001); this.tone(t, 'triangle', 190, 150, 0.06, 0.1, 0.001); }
      if (L >= 3 && b % 2 === 0) { const f = root * Math.pow(2, bass / 12); this.tone(t, 'sawtooth', f, f, 0.12, 0.13, 0.004); this.tone(t, 'sine', f / 2, f / 2, 0.14, 0.2, 0.004); }
      if (L >= 4) { const n = [12, 15, 19, 24, 19, 15, 22, 19][i % 8]; const f = root * 2 * Math.pow(2, n / 12); this.tone(t, 'square', f, f, 0.07, 0.035, 0.003); }
      this.mNext += stepLen; this.mStep++;
    }
    this.bus = null;
  }

  private env(t: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(this.bus ?? this.out);
    return g;
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, a = 0.004) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(this.env(t, a, dur, vol));
    o.start(t); o.stop(t + a + dur + 0.02);
  }

  private hiss(t: number, ftype: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, a = 0.003) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx!.createBiquadFilter();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    s.connect(f).connect(this.env(t, a, dur, vol));
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.02);
  }

  /** «Чпок»: пузырь с быстро падающей высотой + щелчок. */
  private pop(t: number, f: number, v: number) {
    this.tone(t, 'sine', f * 1.9, f * 0.45, 0.075, 0.42 * v, 0.002);
    this.tone(t, 'triangle', f * 3.2, f * 1.2, 0.03, 0.12 * v, 0.001);
    this.hiss(t, 'highpass', 3500, 2000, 0.018, 0.25 * v, 0.7, 0.001);
  }

  /** @returns длительность, с */
  private synth(n: SfxName, t: number, v: number, p: number): number {
    const r = (0.94 + Math.random() * 0.12) * p;
    switch (n) {
      case 'swipe': this.hiss(t, 'bandpass', 2600 * r, 700, 0.13, 0.3 * v, 1.5, 0.015); return 0.15;
      case 'slice':
        this.tone(t, 'triangle', 2600 * r, 1900, 0.09, 0.09 * v);
        this.tone(t, 'sine', 3900 * r, 3100, 0.06, 0.05 * v);
        this.hiss(t, 'highpass', 4000, 2500, 0.05, 0.22 * v, 0.8);
        return 0.1;
      case 'hit': // сочный «шлёп» с коротким щелчком стали
        this.hiss(t, 'lowpass', 2200, 300, 0.05, 0.45 * v, 1.2);
        this.tone(t, 'sine', 230 * r, 80, 0.08, 0.4 * v);
        this.tone(t, 'triangle', 1800 * r, 1200, 0.025, 0.07 * v, 0.001);
        return 0.08;
      case 'kill': {
        // разрез: стальной «шинк» + мокрый чпок. Каждое следующее убийство взмаха — на ступень выше.
        const step = Math.round((p - 1) / 0.07), f = 392 * penta(step);
        this.hiss(t, 'highpass', 5200, 2600, 0.05, 0.3 * v, 0.9, 0.001);
        this.tone(t, 'triangle', f * 2, f * 2, 0.11, 0.2 * v, 0.002);
        this.tone(t, 'sine', f, f * 0.995, 0.16, 0.16 * v, 0.002);
        this.pop(t + 0.012, 300 * (0.95 + Math.random() * 0.1), v * 0.75);
        return 0.18;
      }
      case 'pop': this.pop(t, 520 * r, v); return 0.08;
      case 'gem': {
        if (t - this.gemAt > 0.6) this.gemPitch = 0;
        this.gemAt = t; this.gemPitch = Math.min(14, this.gemPitch + 1);
        const f = 660 * penta(this.gemPitch - 1);
        this.tone(t, 'sine', f, f * 1.6, 0.06, 0.14 * v, 0.002); // «блуп»
        this.tone(t + 0.015, 'sine', f * 2, f * 2.4, 0.05, 0.05 * v, 0.002);
        return 0.08;
      }
      case 'heal': [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.05, 'sine', f, f * 1.05, 0.18, 0.13 * v)); return 0.35;
      case 'chest':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.045, 'triangle', f, f, 0.12, 0.16 * v));
        this.hiss(t + 0.2, 'highpass', 6000, 9000, 0.25, 0.06 * v);
        return 0.5;
      case 'level':
        [523, 659, 784, 1046].forEach((f, i) => { this.tone(t + i * 0.06, 'triangle', f, f, 0.16, 0.16 * v); this.tone(t + i * 0.06, 'sine', f * 2, f * 2, 0.1, 0.05 * v); });
        [1046, 1318, 1568].forEach((f) => this.tone(t + 0.26, 'triangle', f, f * 1.003, 0.5, 0.11 * v, 0.01));
        this.hiss(t + 0.26, 'highpass', 7000, 10000, 0.35, 0.05 * v);
        return 0.8;
      case 'dull': this.tone(t, 'triangle', 240, 150, 0.09, 0.14 * v); this.hiss(t, 'lowpass', 900, 300, 0.07, 0.16 * v); return 0.1;
      case 'loop': // петля замкнулась: «втягивающий» свист вверх
        this.hiss(t, 'bandpass', 500, 3200 * p, 0.22, 0.2 * v, 3, 0.02);
        this.tone(t, 'sine', 330 * p, 990 * p, 0.2, 0.12 * v, 0.01);
        this.tone(t + 0.18, 'triangle', 1320 * p, 1320 * p, 0.14, 0.08 * v);
        return 0.34;
      case 'chestopen': // дробь перед открытием
        for (let i = 0; i < 9; i++) this.tone(t + i * 0.075 * (1 - i * 0.045), 'triangle', 196 * Math.pow(2, i / 12), 196 * Math.pow(2, i / 12), 0.06, 0.1 * v);
        this.hiss(t, 'bandpass', 400, 2400, 0.6, 0.12 * v, 2, 0.3);
        return 0.7;
      case 'reveal':
        [523, 659, 784, 1046, 1318, 1568].forEach((f) => this.tone(t, 'triangle', f, f * 1.004, 0.9, 0.075 * v, 0.008));
        this.tone(t, 'sine', 130, 65, 0.4, 0.3 * v);
        this.hiss(t, 'highpass', 6000, 11000, 0.6, 0.08 * v);
        return 1;
      case 'synergy': [392, 523, 659, 784, 1046, 1568].forEach((f, i) => this.tone(t + i * 0.06, 'triangle', f, f * 1.01, 0.3, 0.14 * v)); return 0.7;
      case 'card': this.tone(t, 'sine', 900 * r, 1400, 0.05, 0.08 * v); return 0.06;
      case 'reroll': for (let i = 0; i < 4; i++) this.tone(t + i * 0.04, 'square', 500 + i * 180, 600 + i * 180, 0.04, 0.05 * v); return 0.2;
      case 'hurt': this.tone(t, 'square', 180, 70, 0.2, 0.16 * v); this.hiss(t, 'lowpass', 900, 200, 0.15, 0.3 * v); return 0.22;
      case 'explode':
        this.hiss(t, 'lowpass', 2200, 70, 0.55, 0.7 * v, 0.8);
        this.tone(t, 'sine', 110, 30, 0.45, 0.55 * v);
        this.pop(t, 260, v * 0.6);
        return 0.6;
      case 'rune': [392, 523, 659, 784].forEach((f) => this.tone(t, 'sine', f, f * 1.02, 0.55, 0.08 * v, 0.03)); this.hiss(t, 'highpass', 5000, 8000, 0.4, 0.06 * v); return 0.6;
      case 'boss': this.tone(t, 'sawtooth', 70, 45, 1.1, 0.25 * v, 0.1); this.tone(t, 'sawtooth', 73, 44, 1.1, 0.2 * v, 0.1); this.hiss(t, 'lowpass', 500, 100, 1, 0.3 * v); return 1.2;
      case 'jump': this.tone(t, 'sine', 180, 520, 0.16, 0.16 * v); return 0.18;
      case 'land': this.hiss(t, 'lowpass', 600, 80, 0.2, 0.5 * v); this.tone(t, 'sine', 110, 40, 0.18, 0.35 * v); return 0.22;
      case 'crate': // треск дерева
        this.hiss(t, 'bandpass', 1800, 900, 0.05, 0.35 * v, 3);
        this.hiss(t + 0.03, 'bandpass', 1200, 500, 0.08, 0.3 * v, 3);
        this.tone(t, 'triangle', 300 * r, 120, 0.06, 0.12 * v);
        return 0.14;
      case 'spit': this.hiss(t, 'bandpass', 1400, 400, 0.12, 0.22 * v, 4); this.tone(t, 'sine', 300, 600, 0.08, 0.07 * v); return 0.14;
      case 'clank': this.tone(t, 'square', 1250 * r, 1100, 0.08, 0.1 * v); this.tone(t, 'square', 1870 * r, 1700, 0.1, 0.07 * v); return 0.12;
      case 'fall': this.tone(t, 'sine', 700, 70, 0.6, 0.16 * v, 0.01); return 0.62;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.12, 'triangle', f, f, 0.25, 0.2 * v)); return 1.1;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(t + i * 0.18, 'triangle', f, f * 0.98, 0.3, 0.2 * v)); return 1;
      case 'fuse': this.tone(t, 'square', 1500, 1500, 0.04, 0.06 * v); return 0.05;
      case 'zap': this.hiss(t, 'highpass', 4000, 2000, 0.08, 0.15 * v); this.tone(t, 'sawtooth', 900 * r, 300, 0.08, 0.06 * v); return 0.1;
      case 'throw': this.hiss(t, 'bandpass', 900, 2200, 0.15, 0.15 * v, 2); return 0.16;
      case 'spear': this.hiss(t, 'bandpass', 1600, 4000, 0.12, 0.2 * v, 3); this.tone(t, 'triangle', 600, 1400, 0.1, 0.07 * v); return 0.14;
      case 'wave': this.hiss(t, 'lowpass', 600, 2400, 0.35, 0.25 * v, 1.5, 0.05); this.tone(t, 'sine', 160, 320, 0.3, 0.1 * v, 0.04); return 0.4;
      case 'charge': this.tone(t, 'sine', 400, 1200, 0.18, 0.12 * v); this.tone(t + 0.12, 'sine', 1200, 1200, 0.12, 0.08 * v); return 0.3;
      case 'bell': [880, 1320, 1760].forEach((f) => this.tone(t, 'sine', f, f, 1.2, 0.12 * v, 0.005)); return 1.2;
    }
  }
}

export const sfx = new Sfx();
