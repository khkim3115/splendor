// 오리지널 보석 비주얼 — 색+도형 이중 부호화 (색각 이상 대비, docs/ROADMAP.md M7)
// 원작 그래픽 자산은 사용하지 않는다 (README 저작권 안내)
//
// 색만으로 구분하지 않는다: 6색이 각각 다른 실루엣을 가지므로 색각 이상(적록/청황/전색맹)
// 시뮬레이션에서도 도형만으로 구별된다. FILL/STROKE/SHAPE는 연출 레이어(FlyLayer)가
// 동일한 보석을 명령형으로 그릴 때도 재사용한다 (단일 진실원).

import type { TokenColor } from '../../../engine'

export const GEM_FILL: Record<TokenColor, string> = {
  white: '#f5f0e6',
  blue: '#2a5db0',
  green: '#1e8f4e',
  red: '#c23b2e',
  black: '#3a3a3a',
  gold: '#d9a520',
}

export const GEM_STROKE: Record<TokenColor, string> = {
  white: '#b8b0a0',
  blue: '#1b3f7a',
  green: '#136338',
  red: '#8c2a20',
  black: '#141414',
  gold: '#9c7514',
}

/**
 * 색별로 실루엣이 다른 보석 도형 — 색각 이상(적록/청황/전색맹) 시에도 도형만으로 6색이
 * 구별된다. 정점 수를 최대한 갈라 놓았다: 삼각(3)·오각(5)·육각(6)·별(10)은 수 자체가 다르고,
 * 남는 두 4정점(마름모/정사각)은 회전각(45° vs 축정렬)이 달라 회색조에서도 헷갈리지 않는다.
 * (docs/ROADMAP.md M7 DoD — 색각 이상 시뮬레이터에서 6색 토큰 구분 가능)
 */
export const GEM_SHAPE: Record<TokenColor, string> = {
  white: '12,2 19,12 12,22 5,12', // 다이아몬드(45° 마름모)
  blue: '12,22 3,5 21,5', // 사파이어(아래로 뾰족한 삼각 — 3정점)
  green: '7,3 17,3 22,12 17,21 7,21 2,12', // 에메랄드(가로 육각 — 6정점)
  red: '12,2 20,8 17,21 7,21 4,8', // 루비(오각 — 5정점)
  black: '5,5 19,5 19,19 5,19', // 오닉스(축정렬 정사각)
  gold: '12,1 15,8 23,9 17,14 19,22 12,18 5,22 7,14 1,9 9,8', // 황금(별 — 10정점)
}

export function gemSvgMarkup(color: TokenColor, size = 20): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${color}" class="gem-icon">` +
    `<polygon points="${GEM_SHAPE[color]}" fill="${GEM_FILL[color]}" stroke="${GEM_STROKE[color]}" stroke-width="1.6" stroke-linejoin="round" />` +
    `<polygon points="12,4 15,7 12,10 9,7" fill="rgba(255,255,255,0.45)" />` +
    `</svg>`
  )
}

export function GemIcon({ color, size = 20 }: { color: TokenColor; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={color}
      className="gem-icon"
    >
      <polygon
        points={GEM_SHAPE[color]}
        fill={GEM_FILL[color]}
        stroke={GEM_STROKE[color]}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* 하이라이트 — 보석 광택 */}
      <polygon points="12,4 15,7 12,10 9,7" fill="rgba(255,255,255,0.45)" />
    </svg>
  )
}
