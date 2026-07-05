// TokenMap/GemMap 순수 연산 유틸.
// hashState(JSON.stringify 기반)의 결정론을 위해 모든 맵은 고정 키 순서 리터럴로만 생성한다.

import type { GemColor, GemMap, TokenColor, TokenMap } from './types'

export const ZERO_TOKENS: TokenMap = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
export const ZERO_GEMS: GemMap = { white: 0, blue: 0, green: 0, red: 0, black: 0 }

export function tokenTotal(m: TokenMap): number {
  return m.white + m.blue + m.green + m.red + m.black + m.gold
}

export function addTokens(a: TokenMap, b: TokenMap): TokenMap {
  return {
    white: a.white + b.white,
    blue: a.blue + b.blue,
    green: a.green + b.green,
    red: a.red + b.red,
    black: a.black + b.black,
    gold: a.gold + b.gold,
  }
}

export function subtractTokens(a: TokenMap, b: TokenMap): TokenMap {
  return {
    white: a.white - b.white,
    blue: a.blue - b.blue,
    green: a.green - b.green,
    red: a.red - b.red,
    black: a.black - b.black,
    gold: a.gold - b.gold,
  }
}

export function withTokenDelta(m: TokenMap, color: TokenColor, delta: number): TokenMap {
  const out = { white: m.white, blue: m.blue, green: m.green, red: m.red, black: m.black, gold: m.gold }
  out[color] += delta
  return out
}

export function withGemDelta(m: GemMap, color: GemColor, delta: number): GemMap {
  const out = { white: m.white, blue: m.blue, green: m.green, red: m.red, black: m.black }
  out[color] += delta
  return out
}
