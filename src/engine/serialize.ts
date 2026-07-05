// 상태 해시 (M1 최소 구현 — 전체 직렬화/리플레이는 M3에서)
// 엔진이 생성하는 모든 객체는 고정 키 순서의 리터럴이고, 유일한 외부 유입 조각인
// config는 setupGame이 고정 키 순서로 재구성해 임베드하므로 JSON.stringify가 결정론적이다.

import type { GameState } from './types'

/** FNV-1a 32비트 해시 — 결정론/리플레이 비교용 (암호학적 아님) */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function hashState(state: GameState): string {
  return fnv1a(JSON.stringify(state))
}
