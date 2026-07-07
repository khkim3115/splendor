// 무채색 압축 표기 — 보석을 색이 아니라 글자코드로 나타낸다 (스펙 §보석 글자코드 매핑)
// ko: 색 이름 첫 글자(흰/파/초/빨/검/노), en: 색 첫 글자(파랑/검정 충돌은 검정=K, CMYK 관습)

import type { TokenColor } from '../engine'

export type GemLang = 'ko' | 'en'

export const GEM_CODE: Record<GemLang, Record<TokenColor, string>> = {
  ko: { white: '흰', blue: '파', green: '초', red: '빨', black: '검', gold: '노' },
  en: { white: 'W', blue: 'B', green: 'G', red: 'R', black: 'K', gold: 'Y' },
}

export function gemCode(color: TokenColor, lang: GemLang): string {
  return GEM_CODE[lang][color]
}
