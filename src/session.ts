import type { Msg, Net } from './net';

/** Текущая сетевая сессия: main.ts раздаёт сообщения активной сцене. */
export const session = {
  net: null as Net | null,
  onMsg: null as ((m: Msg) => void) | null,
  onSnap: null as ((b: ArrayBuffer) => void) | null,
  onClose: null as ((reason: string) => void) | null,
};
