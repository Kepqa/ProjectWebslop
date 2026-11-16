import Phaser from 'phaser';
import {
  isTrainingDummy,
  opponentCombat,
  opponentSkin,
  type Opponent,
} from './opponents';
import { DUMMY_SPRITES } from './dummy-sprites';
import type { PlayerProfile } from './types';
import arenaBackgroundUrl from './assets/prints/arena/gladiator-arena-background.jpg';
import {
  BLOOD_HITS_FOR_FINISH,
  CLINCH_DAMAGE_FACTOR,
  CLINCH_WINDOW_MS,
  DOUBLE_SECOND_FACTOR,
  FINISH_DAMAGE_MUL,
  HEAVY_DAMAGE_MUL,
  HEAVY_TELEGRAPH_MUL,
  KNOCKBACK_BONUS_MS,
  KNOCKBACK_DAMAGE_MUL,
  PARRY_WINDOW_MS,
  PERFECT_BLOCK_MS,
  RICOCHET_GAP_MS,
  RICOCHET_STUN_MS,
  SHIELD_BROKEN_FACTOR,
  SHIELD_COST_BLOCK,
  SHIELD_COST_FEINT_PUNISH,
  SHIELD_COST_PERFECT,
  SHIELD_MAX,
  SHIELD_REGEN_PER_CYCLE,
  berserkerTelegraphMul,
  rollAttackPattern,
  type AttackPattern,
} from './combat-mechanics';
import {
  blockActiveMs,
  counterGuardMs,
  createGladiatorArmature,
  GLADIATOR_PART_URLS,
  gladiatorPartKey,
  gladiatorRigScale,
  lowHitDurationMs,
  interruptArmature,
  playBlock,
  playCounter,
  playHardHit,
  playLowHit,
  playTakingDmg,
  HEATER_TEXTURE_KEY,
  HEATER_URL,
  BUCKLER_TEXTURE_KEY,
  BUCKLER_URL,
  type GladiatorArmature,
  type ShieldKind,
} from './dragonbones-fighter';

type FighterParts = {
  body: Phaser.GameObjects.Container;
  armature: GladiatorArmature | null;
  arm: Phaser.GameObjects.Container;
  weapon: Phaser.GameObjects.Container;
  direction: number;
};

const arenaBackgroundKey = 'arena-background';
/** Чуть шире 0.37/0.63, но не так широко как 0.34/0.66. */
const playerSlot = 0.355;
const opponentSlot = 0.645;

/** Камень кольца на фоне 1280×720: верхняя и нижняя дуга кирпичей. */
const BG_RING_TOP = 260;
const BG_RING_BOT = 660;
const BG_NATIVE_H = 720;
/** Сдвиг ног вниз по экрану (к нижней дуге кольца). */
const GROUND_NUDGE_PX = 36;

/** Игрок всегда выше врага в простое; на своём ударе — ещё выше до конца анимации. */
const DEPTH_IDLE_PLAYER = 4;
const DEPTH_IDLE_OPPONENT = 2;
const DEPTH_ATTACK = 6;

type BattleResult = {
  won: boolean;
  gold: number;
  xp: number;
};

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerFighter!: FighterParts;
  private opponentFigure!: Phaser.GameObjects.Container;
  private opponentFighter!: FighterParts;
  private telegraphWaves: Phaser.GameObjects.Graphics[] = [];
  private calloutRoot?: Phaser.GameObjects.Container;
  private calloutHide?: Phaser.Time.TimerEvent;
  private resultBanner?: Phaser.GameObjects.Container;
  private playerHp = 100;
  private opponentHp = 80;
  private maxOpponentHp = 80;
  private blockStartedAt = 0;
  private blockUntil = 0;
  private parryUntil = 0;
  private running = false;
  private enemyAttackEpoch = 0;
  private enemyTimers: Phaser.Time.TimerEvent[] = [];
  private profile: PlayerProfile;
  private opponent: Opponent;

  private shieldHp = SHIELD_MAX;
  private bloodHits = 0;
  private finishReady = false;
  private enemyBlocksTaken = 0;
  private enemyBrokenUntil = 0;
  private knockbackBonusUntil = 0;
  private playerSwingUntil = 0;
  private lastDummyHitAt = 0;
  private playerStunnedUntil = 0;
  private pendingPattern: AttackPattern = 'normal';
  private sandSlowUntil = 0;

  constructor(profile: PlayerProfile, opponent: Opponent) {
    super('Arena');
    this.profile = profile;
    this.opponent = opponent;
  }

  preload(): void {
    this.load.image(arenaBackgroundKey, arenaBackgroundUrl);
    this.load.image(HEATER_TEXTURE_KEY, HEATER_URL);
    this.load.image(BUCKLER_TEXTURE_KEY, BUCKLER_URL);
    for (const [name, url] of Object.entries(GLADIATOR_PART_URLS)) {
      this.load.image(gladiatorPartKey(name), url);
    }
    const skin = opponentSkin(this.opponent);
    if (skin) {
      for (const [name, url] of Object.entries(skin.parts)) {
        this.load.image(gladiatorPartKey(name, skin.id), url);
      }
    }
    if (isTrainingDummy(this.opponent)) {
      const dummy = DUMMY_SPRITES[this.opponent.dummyId ?? 'wood'];
      this.load.image(dummy.textureKey, dummy.url);
    }
  }

  create(): void {
    const { width, height } = this.scale;
    const ground = this.drawArenaBackground(width, height);

    this.playerFighter = this.makeFighter(width * playerSlot, ground, 1);
    this.player = this.playerFighter.body;
    this.opponentFighter = isTrainingDummy(this.opponent)
      ? this.makeTrainingDummy(width * opponentSlot, ground)
      : this.makeOpponent(width * opponentSlot, ground);
    this.opponentFigure = this.opponentFighter.body;
    this.setFighterDepths('idle');

    this.events.on('battle:start', this.startBattle, this);
    this.events.on('battle:attack', this.attack, this);
    this.events.on('battle:hard-attack', this.hardAttack, this);
    this.events.on('battle:block', this.block, this);
    this.events.on('battle:counter', this.counter, this);
    this.events.on('battle:finish', this.finishStrike, this);
    this.events.on('battle:stop', this.stopBattle, this);
    this.game.events.emit('arena:ready');
  }

  /** Фон как раньше (низ к рамке). Возвращает Y середины кольца на этом фоне. */
  private drawArenaBackground(width: number, height: number): number {
    const background = this.add.image(width / 2, height, arenaBackgroundKey).setOrigin(0.5, 1);
    const cover = Math.max(width / background.width, height / background.height) * 1.14;
    background.setScale(cover).setDepth(-2);
    const shade = this.add.graphics().setDepth(-1);
    shade.fillStyle(0x17120c, 0.16);
    shade.fillRect(0, 0, width, height);
    shade.fillStyle(0x000000, 0.1);
    shade.fillRect(0, 0, width, height * 0.18);
    const ringMid = (BG_RING_TOP + BG_RING_BOT) / 2;
    return height - (BG_NATIVE_H - ringMid) * cover + GROUND_NUDGE_PX;
  }

  private setFighterDepths(mode: 'idle' | 'player-attack' | 'enemy-attack'): void {
    if (mode === 'player-attack') {
      this.opponentFigure.setDepth(DEPTH_IDLE_OPPONENT);
      this.player.setDepth(DEPTH_ATTACK);
      this.children.bringToTop(this.player);
      return;
    }
    if (mode === 'enemy-attack') {
      this.player.setDepth(DEPTH_IDLE_PLAYER);
      this.opponentFigure.setDepth(DEPTH_ATTACK);
      this.children.bringToTop(this.opponentFigure);
      return;
    }
    this.opponentFigure.setDepth(DEPTH_IDLE_OPPONENT);
    this.player.setDepth(DEPTH_IDLE_PLAYER);
    this.children.bringToTop(this.player);
  }

  private makeFighter(
    x: number,
    y: number,
    direction: number,
    options: {
      tint?: number;
      skinId?: string;
      partUrls?: Record<string, string>;
      scaleMul?: number;
      withShield?: boolean | ShieldKind;
    } = {},
  ): FighterParts {
    const tint = direction === 1 && this.profile.skin !== 'bronze'
      ? this.skinColor(this.profile.skin)
      : (options.tint ?? 0xffffff);
    const armature = createGladiatorArmature(this, x, y, direction, {
      ...options,
      tint,
      withShield: options.withShield ?? (direction === 1 ? 'heater' : false),
    });
    return {
      body: armature.root,
      armature,
      arm: armature.bones.get('лево_плечо') ?? armature.root,
      weapon: armature.bones.get('лево_кулак_меч') ?? armature.root,
      direction,
    };
  }

  private makeOpponent(x: number, y: number): FighterParts {
    const skin = opponentSkin(this.opponent);
    const scaleMul = (skin?.scaleMul ?? 1) * (this.opponent.scaleMul ?? 1);
    return this.makeFighter(x, y, -1, {
      tint: this.opponent.tint ?? 0xffffff,
      skinId: skin?.id,
      partUrls: skin?.parts,
      scaleMul,
      withShield: this.opponent.id === 'oro' || this.opponent.archetype === 'wall'
        ? (this.opponent.id === 'oro' ? 'buckler' : 'heater')
        : false,
    });
  }

  private makeTrainingDummy(x: number, y: number): FighterParts {
    const dummy = DUMMY_SPRITES[this.opponent.dummyId ?? 'wood'];
    const sprite = this.add.image(0, 0, dummy.textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(
      dummy.displayHeight * (sprite.width / Math.max(1, sprite.height)),
      dummy.displayHeight,
    );
    sprite.setFlipX(true);
    const stub = this.add.container(0, -96);
    const body = this.add.container(x, y, [sprite, stub]);
    body.setData('homeX', x);
    body.setData('homeY', y);
    return { body, armature: null, arm: stub, weapon: stub, direction: -1 };
  }

  private skinColor(skin: PlayerProfile['skin']): number {
    if (skin === 'ember') return 0xffc7ba;
    if (skin === 'azure') return 0xc3deff;
    return 0xffffff;
  }

  private combat() {
    return opponentCombat(this.opponent);
  }

  private startBattle(): void {
    this.playerHp = Math.min(170, this.profile.vitality);
    this.opponentHp = this.opponent.hp;
    this.maxOpponentHp = this.opponent.hp;
    this.shieldHp = SHIELD_MAX;
    this.bloodHits = 0;
    this.finishReady = false;
    this.enemyBlocksTaken = 0;
    this.enemyBrokenUntil = 0;
    this.knockbackBonusUntil = 0;
    this.playerSwingUntil = 0;
    this.lastDummyHitAt = 0;
    this.playerStunnedUntil = 0;
    this.sandSlowUntil = 0;
    this.running = true;
    this.clearCallout();
    this.clearResultBanner();
    this.clearTelegraphWaves();
    this.emitHealth();
    this.emitCombatHud();
    if (!isTrainingDummy(this.opponent)) this.scheduleEnemyAttack();
  }

  private clearEnemyTimers(): void {
    for (const timer of this.enemyTimers) timer.remove(false);
    this.enemyTimers = [];
  }

  private trackEnemyTimer(timer: Phaser.Time.TimerEvent): Phaser.Time.TimerEvent {
    this.enemyTimers.push(timer);
    return timer;
  }

  private clearTelegraphWaves(): void {
    for (const wave of this.telegraphWaves) {
      const state = wave.getData('waveState') as { t: number } | undefined;
      if (state) this.tweens.killTweensOf(state);
      this.tweens.killTweensOf(wave);
      wave.destroy();
    }
    this.telegraphWaves = [];
  }

  /** Мировая точка плеч бойца (или оценка для столба). */
  private fighterShoulderPoint(fighter: FighterParts): { x: number; y: number } {
    const arm = fighter.armature;
    if (arm) {
      const left = arm.bones.get('лево_плечо');
      const right = arm.bones.get('право_плечо');
      if (left && right) {
        const a = left.getWorldTransformMatrix();
        const b = right.getWorldTransformMatrix();
        return { x: (a.tx + b.tx) / 2, y: (a.ty + b.ty) / 2 };
      }
      if (left) {
        const a = left.getWorldTransformMatrix();
        return { x: a.tx, y: a.ty };
      }
    }
    const s = Math.abs(fighter.body.scaleY) || gladiatorRigScale;
    return {
      x: fighter.body.x,
      y: fighter.body.y - 820 * s,
    };
  }

  private opponentShoulderPoint(): { x: number; y: number } {
    return this.fighterShoulderPoint(this.opponentFighter);
  }

  /**
   * Три красные волны от плеч врага весь телеграф.
   * За персонажами; только боковые дуги — корпус не перекрывают.
   */
  private flashAlert(durationMs = 700): void {
    this.clearTelegraphWaves();
    const g = this.add.graphics().setDepth(1);
    const state = { t: 0 };
    g.setData('waveState', state);
    this.telegraphWaves.push(g);

    const cycleMs = 420;
    const waveAlpha = 0.4;

    this.tweens.add({
      targets: state,
      t: 1,
      duration: Math.max(180, durationMs),
      ease: 'Linear',
      onUpdate: () => {
        if (!g.active) return;
        const shoulder = this.opponentShoulderPoint();
        g.setPosition(shoulder.x, shoulder.y);
        g.clear();
        const elapsed = state.t * Math.max(180, durationMs);
        for (let i = 0; i < 3; i += 1) {
          const phase = ((elapsed / cycleMs) + i / 3) % 1;
          const r = 16 + phase * 28;
          const a = waveAlpha * (1 - phase * 0.7);
          g.lineStyle(3.2, 0xff2a2a, a);
          // Боковые дуги в стороны от плеч (не через торс).
          g.beginPath();
          g.arc(0, 0, r, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(50), false);
          g.strokePath();
          g.beginPath();
          g.arc(0, 0, r, Phaser.Math.DegToRad(130), Phaser.Math.DegToRad(230), false);
          g.strokePath();
        }
      },
      onComplete: () => {
        this.clearTelegraphWaves();
      },
    });
  }

  private scheduleEnemyAttack(): void {
    if (!this.running || isTrainingDummy(this.opponent)) return;
    if (this.time.now < this.enemyBrokenUntil) {
      this.trackEnemyTimer(this.time.delayedCall(this.enemyBrokenUntil - this.time.now + 40, () => {
        if (this.running) this.scheduleEnemyAttack();
      }));
      return;
    }

    const epoch = this.enemyAttackEpoch;
    const combat = this.combat();
    const pattern = rollAttackPattern(combat);
    this.pendingPattern = pattern;

    let telegraph = this.opponent.telegraphMs ?? 700;
    if (this.opponent.archetype === 'berserker') {
      telegraph *= berserkerTelegraphMul(this.opponentHp / Math.max(1, this.maxOpponentHp));
    }
    if (pattern === 'heavy') telegraph *= HEAVY_TELEGRAPH_MUL;
    if (this.time.now < this.sandSlowUntil) telegraph *= 1.35;

    const cooldown = this.opponent.cooldownMs
      ?? Math.max(860, lowHitDurationMs * 0.55);

    this.flashAlert(telegraph);
    this.game.events.emit('arena:telegraph', { pattern });

    this.trackEnemyTimer(this.time.delayedCall(telegraph, () => {
      if (!this.running || epoch !== this.enemyAttackEpoch) return;
      this.clearTelegraphWaves();

      if (pattern === 'feint') {
        this.resolveFeint(epoch);
        this.regenShield();
        this.trackEnemyTimer(this.time.delayedCall(cooldown * 0.7, () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.scheduleEnemyAttack();
        }));
        return;
      }

      this.playEnemySwing(pattern, epoch, () => {
        if (epoch !== this.enemyAttackEpoch) return;
        this.resolveEnemyHit(pattern === 'heavy' ? HEAVY_DAMAGE_MUL : 1, pattern);
      });

      if (pattern === 'double') {
        this.trackEnemyTimer(this.time.delayedCall(340, () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.flashAlert(280);
          this.playEnemySwing('normal', epoch, () => {
            if (epoch !== this.enemyAttackEpoch) return;
            this.resolveEnemyHit(DOUBLE_SECOND_FACTOR, 'double');
          });
        }));
      }

      this.regenShield();
      this.trackEnemyTimer(this.time.delayedCall(
        cooldown + (pattern === 'double' ? 360 : 0),
        () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.scheduleEnemyAttack();
        },
      ));
    }));
  }

  private playEnemySwing(
    pattern: AttackPattern,
    epoch: number,
    onImpact: () => void,
  ): void {
    if (!this.opponentFighter.armature) return;
    const play = pattern === 'heavy' ? playHardHit : playLowHit;
    this.setFighterDepths('enemy-attack');
    play(
      this,
      this.opponentFighter.armature,
      () => {
        if (epoch !== this.enemyAttackEpoch) return;
        this.slashEffect(this.opponentFighter);
        onImpact();
      },
      () => {
        if (epoch === this.enemyAttackEpoch) this.setFighterDepths('idle');
      },
    );
  }

  private resolveFeint(epoch: number): void {
    if (epoch !== this.enemyAttackEpoch) return;
    const now = this.time.now;
    const earlyBlock = now <= this.blockUntil;
    const earlyParry = now <= this.parryUntil;
    if (earlyBlock || earlyParry) {
      this.spendShield(SHIELD_COST_FEINT_PUNISH);
      this.flashWarning('ФИНТ — ЩИТ', '#dc8c75');
      this.game.events.emit('arena:status', 'Финт: ранний блок/контр сожгли щит');
    } else {
      this.flashWarning('ФИНТ', '#c4b799');
      this.game.events.emit('arena:status', 'Финт — удар оборван');
    }
    this.emitCombatHud();
  }

  private interruptEnemyOffense(): void {
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.clearTelegraphWaves();
    this.setFighterDepths('idle');
    if (this.opponentFighter.armature) {
      interruptArmature(this, this.opponentFighter.armature);
    }
    if (isTrainingDummy(this.opponent)) return;
    this.trackEnemyTimer(this.time.delayedCall(620, () => {
      if (!this.running) return;
      this.scheduleEnemyAttack();
    }));
  }

  private shakeOpponent(): void {
    const home = this.opponentFigure.getData('homeY') as number | undefined;
    this.tweens.killTweensOf(this.opponentFigure);
    this.opponentFigure.setAngle(0);
    if (home !== undefined) this.opponentFigure.setY(home);
    this.tweens.add({
      targets: this.opponentFigure,
      angle: { from: -5, to: 5 },
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.opponentFigure.setAngle(0);
      },
    });
  }

  private knockbackOpponent(): void {
    const homeX = this.opponentFigure.getData('homeX') as number;
    this.tweens.killTweensOf(this.opponentFigure);
    this.opponentFigure.setX(homeX);
    this.tweens.add({
      targets: this.opponentFigure,
      x: homeX + 28,
      duration: 120,
      yoyo: true,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.opponentFigure.setX(homeX);
      },
    });
    this.knockbackBonusUntil = this.time.now + KNOCKBACK_BONUS_MS;
  }

  private sandBurst(): void {
    const x = (this.player.x + this.opponentFigure.x) / 2;
    const y = this.player.y - 40;
    for (let i = 0; i < 10; i += 1) {
      const speck = this.add.rectangle(
        x + Phaser.Math.Between(-20, 20),
        y + Phaser.Math.Between(-8, 12),
        Phaser.Math.Between(2, 5),
        Phaser.Math.Between(2, 4),
        0xc9a56a,
        0.85,
      ).setDepth(7);
      this.tweens.add({
        targets: speck,
        x: speck.x + Phaser.Math.Between(-40, 40),
        y: speck.y - Phaser.Math.Between(18, 46),
        alpha: 0,
        duration: Phaser.Math.Between(280, 520),
        ease: 'Quad.Out',
        onComplete: () => speck.destroy(),
      });
    }
    this.sandSlowUntil = this.time.now + 700;
  }

  /** Точка скрещения клинков / удара о щит — между бойцами на высоте оружия. */
  private clashPoint(): { x: number; y: number } {
    const s = Math.abs(this.player.scaleY) || gladiatorRigScale;
    return {
      x: (this.player.x + this.opponentFigure.x) / 2,
      y: Math.min(this.player.y, this.opponentFigure.y) - 520 * s,
    };
  }

  /** Искры при скрещении оружия или ударе о щит. */
  private spawnSparks(at?: { x: number; y: number }, count = 18): void {
    const p = at ?? this.clashPoint();
    const flash = this.add.circle(p.x, p.y, 12, 0xffe000, 0.95).setDepth(50);
    this.tweens.add({
      targets: flash,
      scale: 2.4,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.Out',
      onComplete: () => flash.destroy(),
    });

    const colors = [0xffe000, 0xfff200, 0xffd400, 0xffc107, 0xfff6a0, 0xffffff];
    for (let i = 0; i < count; i += 1) {
      const ang = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.Between(22, 58);
      const g = this.add.graphics().setDepth(50).setPosition(p.x, p.y);
      const color = colors[i % colors.length]!;
      const len = Phaser.Math.Between(8, 16);
      g.lineStyle(2.5, color, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      g.strokePath();
      g.fillStyle(color, 1);
      g.fillCircle(Math.cos(ang) * len, Math.sin(ang) * len, 2.2);

      this.tweens.add({
        targets: g,
        x: p.x + Math.cos(ang) * dist,
        y: p.y + Math.sin(ang) * dist - Phaser.Math.Between(8, 28),
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(280, 480),
        ease: 'Cubic.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  private slashEffect(source: FighterParts): void {
    const dir = source.direction;
    const centerX = source.body.x + dir * 50;
    const centerY = source.body.y - 69;
    const sweep = (from: number, to: number): [number, number, boolean] => (
      dir === 1 ? [from, to, false] : [180 - from, 180 - to, true]
    );
    const [start, end, anticlockwise] = sweep(-86, 34);
    const slash = this.add.graphics({ x: centerX, y: centerY }).setDepth(6);
    for (const [radius, width, alpha, color] of [[33, 6, 0.28, 0xfff2cf], [30, 3, 0.95, 0xffffff]] as const) {
      slash.lineStyle(width, color, alpha);
      slash.beginPath();
      slash.arc(0, 0, radius, Phaser.Math.DegToRad(start), Phaser.Math.DegToRad(end), anticlockwise);
      slash.strokePath();
    }
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: 1.18,
      duration: 170,
      ease: 'Quad.Out',
      onComplete: () => slash.destroy(),
    });
    this.cameras.main.shake(70, 0.0035);
  }

  private spendShield(cost: number): void {
    this.shieldHp = Math.max(0, this.shieldHp - cost);
    this.emitCombatHud();
  }

  private regenShield(): void {
    this.shieldHp = Math.min(SHIELD_MAX, this.shieldHp + SHIELD_REGEN_PER_CYCLE);
    this.emitCombatHud();
  }

  private clearCallout(): void {
    this.calloutHide?.remove(false);
    this.calloutHide = undefined;
    this.calloutRoot?.destroy(true);
    this.calloutRoot = undefined;
  }

  private clearResultBanner(): void {
    this.resultBanner?.destroy(true);
    this.resultBanner = undefined;
  }

  /**
   * Диалог: у врага — справа; у игрока — за спиной (слева).
   * Прозрачность 40%.
   */
  private flashWarning(text: string, color: string, side: 'player' | 'enemy' = 'enemy'): void {
    this.clearCallout();
    const fromPlayer = side === 'player';
    const shoulder = this.fighterShoulderPoint(fromPlayer ? this.playerFighter : this.opponentFighter);
    const label = this.add.text(0, 0, text, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color,
      fontStyle: 'bold',
    }).setOrigin(fromPlayer ? 1 : 0, 0.5);

    const padX = 9;
    const padY = 6;
    const w = label.width + padX * 2;
    const h = Math.max(22, label.height + padY * 2);
    const border = Number.parseInt(color.replace('#', ''), 16);
    const bg = this.add.graphics();
    bg.fillStyle(0x16110e, 0.92);
    bg.lineStyle(1.5, Number.isFinite(border) ? border : 0xe0c080, 1);
    if (fromPlayer) {
      bg.fillRoundedRect(-w, -h / 2, w, h, 5);
      bg.strokeRoundedRect(-w, -h / 2, w, h, 5);
      bg.fillTriangle(7, -5, -1, 0, 7, 5);
      label.setPosition(-padX, 0);
    } else {
      bg.fillRoundedRect(0, -h / 2, w, h, 5);
      bg.strokeRoundedRect(0, -h / 2, w, h, 5);
      bg.fillTriangle(-7, -5, 1, 0, -7, 5);
      label.setPosition(padX, 0);
    }

    const root = this.add.container(
      shoulder.x + (fromPlayer ? -42 : 42),
      shoulder.y - 6,
      [bg, label],
    );
    root.setDepth(12);
    root.setAlpha(0.6);
    this.calloutRoot = root;
    this.calloutHide = this.time.delayedCall(1100, () => this.clearCallout());
  }

  /** Крупный итог боя поверх персонажей, в рамке. */
  private showResultBanner(text: string, won: boolean): void {
    this.clearResultBanner();
    this.clearCallout();
    const { width, height } = this.scale;
    const fill = won ? 0xe5c27c : 0xff5a4a;
    const label = this.add.text(0, 0, text, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '26px',
      color: won ? '#f3e0a8' : '#ffe0dc',
      fontStyle: 'bold',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const padX = 26;
    const padY = 16;
    const w = Math.max(220, label.width + padX * 2);
    const h = label.height + padY * 2;
    const frame = this.add.graphics();
    frame.fillStyle(0x100c0a, 0.94);
    frame.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    frame.lineStyle(3, fill, 1);
    frame.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    frame.lineStyle(1.5, 0xffffff, 0.28);
    frame.strokeRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5);

    const banner = this.add.container(width / 2, height * 0.2, [frame, label]);
    banner.setDepth(40);
    this.resultBanner = banner;
  }

  private resolveEnemyHit(damageMul = 1, pattern: AttackPattern = 'normal'): void {
    if (!this.running) return;
    const now = this.time.now;
    let damage = Math.round(this.opponent.damage * damageMul);

    // Клинч: оба в ударе почти одновременно.
    const inClinch = now <= this.playerSwingUntil;
    if (inClinch) {
      damage = Math.max(1, Math.ceil(damage * CLINCH_DAMAGE_FACTOR));
      const clinchBack = Math.max(1, Math.ceil(
        (this.profile.strength * 0.7 + this.profile.weapon * 8) * CLINCH_DAMAGE_FACTOR,
      ));
      this.opponentHp = Math.max(0, this.opponentHp - clinchBack);
      this.bloodHits = 0;
      this.finishReady = false;
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.spawnSparks(undefined, 20);
      this.flashWarning('КЛИНЧ', '#e0c080', 'player');
      this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
      this.game.events.emit('arena:damage', { side: 'opponent', amount: clinchBack, critical: false });
      this.game.events.emit('arena:status', 'Клинч — оба получили урезанный урон');
      this.emitHealth();
      this.emitCombatHud();
      if (this.playerHp <= 0) this.finishBattle(false);
      else if (this.opponentHp <= 0) this.finishBattle(true);
      return;
    }

    const guarding = now <= this.blockUntil || now <= this.parryUntil;
    if (guarding) {
      const perfect = now - this.blockStartedAt <= PERFECT_BLOCK_MS;
      const parried = now <= this.parryUntil && now - this.blockStartedAt <= PARRY_WINDOW_MS;
      const shieldBroken = this.shieldHp <= 0;
      this.spendShield(perfect || parried ? SHIELD_COST_PERFECT : SHIELD_COST_BLOCK);

      if (parried) {
        damage = 0;
        this.spawnSparks(undefined, 22);
        this.flashWarning('ПАРИРОВАНИЕ', '#f5cb77', 'player');
        this.sandBurst();
        this.knockbackOpponent();
        this.registerEnemyBlock();
        const punish = Math.round(12 + this.opponent.damage * 0.08);
        this.opponentHp = Math.max(0, this.opponentHp - punish);
        this.interruptEnemyOffense();
        if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
        this.game.events.emit('arena:damage', { side: 'opponent', amount: punish, critical: true });
        this.game.events.emit('arena:status', 'Парирование! Контрудар прошёл');
      } else {
        damage = perfect
          ? 0
          : Math.ceil(damage * (shieldBroken ? SHIELD_BROKEN_FACTOR : 0.2));
        this.spawnSparks(undefined, perfect ? 20 : 14);
        this.flashWarning(
          perfect ? 'ИДЕАЛЬНЫЙ БЛОК' : (shieldBroken ? 'ЩИТ СЛОМАН' : 'БЛОК'),
          perfect ? '#f5cb77' : '#c4b799',
          'player',
        );
        this.registerEnemyBlock();
        if (perfect) {
          this.sandBurst();
          this.knockbackOpponent();
          const chip = pattern === 'heavy' ? 16 : 8;
          this.opponentHp = Math.max(0, this.opponentHp - chip);
          this.interruptEnemyOffense();
          if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
          else this.shakeOpponent();
          this.game.events.emit('arena:damage', { side: 'opponent', amount: chip, critical: true });
        }
      }
      if (damage > 0) {
        this.playerHp = Math.max(0, this.playerHp - damage);
        this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
      }
    } else {
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.interruptPlayerOffense();
      this.bloodHits = 0;
      this.finishReady = false;
      if (this.playerFighter.armature) playTakingDmg(this, this.playerFighter.armature);
      else this.flinch(this.player);
      this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
    }

    this.emitHealth();
    this.emitCombatHud();
    if (this.playerHp <= 0) this.finishBattle(false);
    else if (this.opponentHp <= 0) this.finishBattle(true);
  }

  private registerEnemyBlock(): void {
    const combat = this.combat();
    this.enemyBlocksTaken += 1;
    if (this.enemyBlocksTaken >= combat.blocksToBreak && combat.breakStunMs > 0) {
      this.enemyBlocksTaken = 0;
      this.enemyBrokenUntil = this.time.now + combat.breakStunMs;
      this.interruptEnemyOffense();
      this.flashWarning('СЛОМ СТОЙКИ', '#e5c27c', 'player');
      this.game.events.emit('arena:status', 'Стойка врага сломлена — бей!');
    }
  }

  private dealPlayerDamage(multiplier: number, critical = false, opts: {
    isLunge?: boolean;
    isFinish?: boolean;
  } = {}): void {
    if (!this.running) return;
    if (this.time.now < this.playerStunnedUntil) {
      this.flashWarning('ОГЛУШЁН', '#dc8c75', 'player');
      return;
    }

    let mul = multiplier;
    if (this.time.now <= this.knockbackBonusUntil && opts.isLunge) {
      mul *= KNOCKBACK_DAMAGE_MUL;
      this.knockbackBonusUntil = 0;
      this.flashWarning('ВЫПАД С РАЗГОНА', '#f5cb77', 'player');
    }

    // Стена гасит выпад.
    const wallChance = this.combat().wallBlockChance;
    if (opts.isLunge && wallChance > 0 && Math.random() < wallChance) {
      this.spawnSparks(undefined, 18);
      this.flashWarning('ЩИТ ВРАГА', '#c4b799');
      this.game.events.emit('arena:status', 'Стена погасила выпад');
      this.bloodHits = 0;
      this.finishReady = false;
      this.emitCombatHud();
      return;
    }

    let damage = Math.round(
      (this.profile.strength * 0.7 + this.profile.weapon * 8 + Phaser.Math.Between(2, 7)) * mul,
    );
    this.opponentHp = Math.max(0, this.opponentHp - damage);
    this.interruptEnemyOffense();

    if (this.combat().ricochet) {
      const gap = this.time.now - this.lastDummyHitAt;
      this.lastDummyHitAt = this.time.now;
      if (gap > 0 && gap < RICOCHET_GAP_MS) {
        this.playerStunnedUntil = this.time.now + RICOCHET_STUN_MS;
        this.flashWarning('РИКОШЕТ', '#dc8c75', 'player');
        this.game.events.emit('arena:status', 'Рикошет столба — сбей ритм');
        this.game.events.emit('arena:stun', { ms: RICOCHET_STUN_MS });
      }
    }

    if (!opts.isFinish) {
      this.bloodHits += 1;
      if (this.bloodHits >= BLOOD_HITS_FOR_FINISH && !this.finishReady) {
        this.finishReady = true;
        this.flashWarning('ДОБИВАНИЕ', '#e5c27c', 'player');
        this.game.events.emit('arena:finish-ready');
      }
    } else {
      this.bloodHits = 0;
      this.finishReady = false;
    }

    if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
    else this.shakeOpponent();
    this.game.events.emit('arena:damage', { side: 'opponent', amount: damage, critical });
    this.emitHealth();
    this.emitCombatHud();
    if (this.opponentHp <= 0) this.finishBattle(true);
  }

  private attack(): void {
    if (!this.running || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 400;
    this.setFighterDepths('player-attack');
    playLowHit(
      this,
      this.playerFighter.armature,
      () => {
        this.slashEffect(this.playerFighter);
        this.dealPlayerDamage(1);
      },
      () => this.setFighterDepths('idle'),
    );
  }

  private hardAttack(): void {
    if (!this.running || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 500;
    this.setFighterDepths('player-attack');
    playHardHit(
      this,
      this.playerFighter.armature,
      () => {
        this.slashEffect(this.playerFighter);
        this.dealPlayerDamage(1.45, false, { isLunge: true });
      },
      () => this.setFighterDepths('idle'),
    );
  }

  private finishStrike(): void {
    if (!this.running || !this.finishReady || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.finishReady = false;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 500;
    this.setFighterDepths('player-attack');
    playHardHit(
      this,
      this.playerFighter.armature,
      () => {
        this.slashEffect(this.playerFighter);
        this.dealPlayerDamage(FINISH_DAMAGE_MUL, true, { isFinish: true, isLunge: true });
        this.flashWarning('ДОБИВАНИЕ!', '#f5cb77', 'player');
      },
      () => this.setFighterDepths('idle'),
    );
    this.emitCombatHud();
  }

  private block(): void {
    if (!this.running || !this.playerFighter.armature) return;
    this.blockStartedAt = this.time.now;
    this.blockUntil = this.time.now + blockActiveMs;
    this.parryUntil = 0;
    playBlock(this, this.playerFighter.armature);
  }

  private counter(): void {
    if (!this.running || !this.playerFighter.armature) return;
    this.blockStartedAt = this.time.now;
    this.blockUntil = this.time.now + counterGuardMs;
    this.parryUntil = this.time.now + PARRY_WINDOW_MS + 40;
    this.setFighterDepths('player-attack');
    playCounter(
      this,
      this.playerFighter.armature,
      () => {
        this.slashEffect(this.playerFighter);
        this.dealPlayerDamage(1.15, true);
        this.flashWarning('КОНТРАТАКА', '#f5cb77', 'player');
      },
      () => this.setFighterDepths('idle'),
    );
  }

  private interruptPlayerOffense(): void {
    if (!this.playerFighter.armature?.playing) return;
    interruptArmature(this, this.playerFighter.armature);
    this.setFighterDepths('idle');
    this.blockUntil = 0;
    this.parryUntil = 0;
    this.playerSwingUntil = 0;
    this.game.events.emit('arena:interrupt');
  }

  private flinch(figure: Phaser.GameObjects.Container): void {
    const home = figure.getData('homeX') as number;
    this.tweens.killTweensOf(figure);
    figure.setX(home);
    this.tweens.add({
      targets: figure,
      x: home - 10,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => figure.setX(home),
    });
  }

  private emitHealth(): void {
    this.game.events.emit('arena:health', {
      player: this.playerHp,
      maxPlayer: Math.min(170, this.profile.vitality),
      opponent: this.opponentHp,
      maxOpponent: this.maxOpponentHp,
    });
  }

  private emitCombatHud(): void {
    this.game.events.emit('arena:combat', {
      shield: this.shieldHp,
      shieldMax: SHIELD_MAX,
      blood: this.bloodHits,
      bloodNeed: BLOOD_HITS_FOR_FINISH,
      finishReady: this.finishReady,
      pattern: this.pendingPattern,
    });
  }

  private finishBattle(won: boolean): void {
    this.running = false;
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.clearTelegraphWaves();
    this.finishReady = false;
    const winText = isTrainingDummy(this.opponent)
      ? `${this.opponent.name.toUpperCase()} СЛОМАН`
      : 'ПОБЕДА';
    this.showResultBanner(won ? winText : 'ПОРАЖЕНИЕ', won);
    const [minGold, maxGold] = this.opponent.goldWin;
    this.game.events.emit('arena:finished', {
      won,
      gold: won ? Phaser.Math.Between(minGold, maxGold) : Math.max(2, Math.floor(minGold / 4)),
      xp: won ? this.opponent.xpWin : this.opponent.xpLose,
    } satisfies BattleResult);
    this.emitCombatHud();
  }

  private stopBattle(): void {
    this.running = false;
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.clearCallout();
    this.clearResultBanner();
    this.clearTelegraphWaves();
  }
}

export function createArena(
  mount: HTMLElement,
  profile: PlayerProfile,
  opponent: Opponent,
  onEvent: (event: string, value?: unknown) => void,
): Phaser.Game {
  // Портретный холст (телефон): бойцы бок о бок, кнопки — в HTML снизу.
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: mount,
    width: 390,
    height: 340,
    backgroundColor: '#171512',
    render: {
      antialias: true,
      roundPixels: true,
      powerPreference: 'low-power',
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent: mount,
    },
    scene: [new ArenaScene(profile, opponent)],
  });
  for (const event of [
    'arena:ready',
    'arena:health',
    'arena:damage',
    'arena:finished',
    'arena:telegraph',
    'arena:interrupt',
    'arena:combat',
    'arena:finish-ready',
    'arena:status',
    'arena:stun',
  ]) {
    game.events.on(event, (value: unknown) => onEvent(event, value));
  }
  return game;
}
