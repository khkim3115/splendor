// 무채색 압축 표기 — 보석을 색이 아니라 글자코드로 나타낸다 (스펙 §보석 글자코드 매핑)
// ko: 색 이름 첫 글자(흰/파/초/빨/검/노), en: 색 첫 글자(파랑/검정 충돌은 검정=K, CMYK 관습)

import { GEM_COLORS, TOKEN_COLORS, type Card, type GameState, type GemMap, type TokenColor, type TokenMap } from '../engine'

export type GemLang = 'ko' | 'en'

export const GEM_CODE: Record<GemLang, Record<TokenColor, string>> = {
  ko: { white: '흰', blue: '파', green: '초', red: '빨', black: '검', gold: '노' },
  en: { white: 'W', blue: 'B', green: 'G', red: 'R', black: 'K', gold: 'Y' },
}

export function gemCode(color: TokenColor, lang: GemLang): string {
  return GEM_CODE[lang][color]
}

/** GemMap을 "흰3빨2검1"처럼 0 아닌 색만 코드+수량으로 잇는다 (색 순서 = GEM_COLORS) */
function gemMapCode(map: GemMap, lang: GemLang): string {
  return GEM_COLORS.filter((c) => map[c] > 0)
    .map((c) => `${gemCode(c, lang)}${map[c]}`)
    .join('')
}

/** TokenMap을 "빨3노1"처럼 0 아닌 색만 잇는다 (gold 포함, 순서 = TOKEN_COLORS) */
function tokenMapCode(map: TokenMap, lang: GemLang): string {
  return TOKEN_COLORS.filter((c: TokenColor) => map[c] > 0)
    .map((c) => `${gemCode(c, lang)}${map[c]}`)
    .join('')
}

/** 카드 초압축: "명성보너스|비용" — 명성 0이면 명성 숫자 생략 (스펙 §보석 글자코드 매핑) */
export function cardCode(card: Card, lang: GemLang): string {
  const head = card.points > 0 ? `${card.points}${gemCode(card.bonus, lang)}` : gemCode(card.bonus, lang)
  return `${head}|${gemMapCode(card.cost, lang)}`
}

/** 상대(또는 나) 요약 한 줄: "5점 흰2초1 · 빨3노1 · 예약1" (en은 "5pt …") */
export function playerLine(view: GameState, playerIndex: number, lang: GemLang): string {
  const p = view.players[playerIndex]!
  const score = lang === 'ko' ? `${p.prestige}점` : `${p.prestige}pt`
  const bonuses = gemMapCode(p.bonuses, lang) || '-'
  const toks = tokenMapCode(p.tokens, lang) || '-'
  return `${score} ${bonuses} · ${toks} · 예약${p.reserved.length}`
}
