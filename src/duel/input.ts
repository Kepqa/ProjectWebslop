/**
 * Ввод: клавиатура (по физическим кодам клавиш — работает в любой раскладке) и сенсорные кнопки.
 * Движение и блок — удерживаемые, остальное — «нажатие» на один кадр.
 */
import type { Cmd } from './game';

export type Key = 'left' | 'right' | 'jump' | 'light' | 'heavy' | 'block' | 'dodge' | 's1' | 's2' | 's3';
export type KeyMap = Record<Key, string[]>;

export const SOLO: KeyMap = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp'],
  light: ['KeyJ'], heavy: ['KeyK'], block: ['KeyS', 'ArrowDown', 'KeyL'], dodge: ['Space', 'ShiftLeft', 'ShiftRight'],
  s1: ['KeyU', 'Digit1'], s2: ['KeyI', 'Digit2'], s3: ['KeyO', 'Digit3'],
};
export const P1: KeyMap = {
  left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], block: ['KeyS'],
  light: ['KeyF'], heavy: ['KeyG'], dodge: ['ShiftLeft'], s1: ['Digit1'], s2: ['Digit2'], s3: ['Digit3'],
};
export const P2: KeyMap = {
  left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], block: ['ArrowDown'],
  light: ['Period', 'Numpad1'], heavy: ['Slash', 'Numpad2'], dodge: ['ShiftRight', 'Numpad0'],
  s1: ['KeyK', 'Numpad4'], s2: ['KeyL', 'Numpad5'], s3: ['Semicolon', 'Numpad6'],
};

/** Подпись клавиши для подсказок. */
export function label(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return ({ Period: '.', Slash: '/', Semicolon: ';', Space: 'Пробел', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' } as Record<string, string>)[code] ?? code;
}

const held = new Set<string>();
const pressed = new Set<string>();
const touchHeld = new Set<Key>();
const touchPressed = new Set<Key>();
let onAny: () => void = () => undefined;
export const touchUsed = { v: false };

export function initInput(any: () => void, onEsc: () => void) {
  onAny = any;
  addEventListener('keydown', (e) => {
    onAny();
    if (e.code === 'Escape' || e.code === 'KeyP') { onEsc(); return; }
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => { held.clear(); touchHeld.clear(); });

  for (const b of document.querySelectorAll<HTMLButtonElement>('#touch [data-k]')) {
    const k = b.dataset.k as Key;
    const up = (e: PointerEvent) => { e.preventDefault(); touchHeld.delete(k); b.classList.remove('on'); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); onAny(); touchUsed.v = true;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      touchHeld.add(k); touchPressed.add(k); b.classList.add('on');
      navigator.vibrate?.(8);
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  addEventListener('touchstart', () => { touchUsed.v = true; }, { passive: true });
}

/** Собирает команду игрока по раскладке; touch — подмешивать ли сенсорные кнопки. */
export function readCmd(map: KeyMap, touch: boolean): Cmd {
  const h = (k: Key) => map[k].some((c) => held.has(c)) || (touch && touchHeld.has(k));
  const p = (k: Key) => map[k].some((c) => pressed.has(c)) || (touch && touchPressed.has(k));
  const move = (h('right') ? 1 : 0) - (h('left') ? 1 : 0);
  return {
    move: move as -1 | 0 | 1,
    jump: p('jump'), light: p('light'), heavy: p('heavy'), dodge: p('dodge'),
    block: h('block'),
    spell: p('s1') ? 1 : p('s2') ? 2 : p('s3') ? 3 : 0,
  };
}

/** Вызывать в конце кадра: нажатия живут ровно один кадр. */
export function endFrame() { pressed.clear(); touchPressed.clear(); }
export function clearInput() { held.clear(); pressed.clear(); touchHeld.clear(); touchPressed.clear(); }
