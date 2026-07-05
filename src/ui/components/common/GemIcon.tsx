// 오리지널 보석 비주얼 — 색+도형 이중 부호화 (색각 이상 대비, docs/ROADMAP.md M7)
// 원작 그래픽 자산은 사용하지 않는다 (README 저작권 안내)

import type { TokenColor } from '../../../engine'

const FILL: Record<TokenColor, string> = {
  white: '#f5f0e6',
  blue: '#2a5db0',
  green: '#1e8f4e',
  red: '#c23b2e',
  black: '#3a3a3a',
  gold: '#d9a520',
}

const STROKE: Record<TokenColor, string> = {
  white: '#b8b0a0',
  blue: '#1b3f7a',
  green: '#136338',
  red: '#8c2a20',
  black: '#141414',
  gold: '#9c7514',
}

/** 색별로 실루엣이 다른 보석 도형 */
const SHAPE: Record<TokenColor, string> = {
  white: '12,2 21,9 12,22 3,9', // 다이아몬드(마름모)
  blue: '12,2 22,12 12,22 2,12', // 사파이어(정마름모… 원형 대신 사각 컷)
  green: '7,3 17,3 22,12 17,21 7,21 2,12', // 에메랄드(육각)
  red: '12,2 20,8 17,21 7,21 4,8', // 루비(오각)
  black: '5,5 19,5 19,19 5,19', // 오닉스(사각)
  gold: '12,1 15,8 23,9 17,14 19,22 12,18 5,22 7,14 1,9 9,8', // 황금(별)
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
        points={SHAPE[color]}
        fill={FILL[color]}
        stroke={STROKE[color]}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* 하이라이트 — 보석 광택 */}
      <polygon points="12,4 15,7 12,10 9,7" fill="rgba(255,255,255,0.45)" />
    </svg>
  )
}
