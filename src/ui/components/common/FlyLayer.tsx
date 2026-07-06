// 이벤트 기반 경량 연출 (docs/ROADMAP.md M7) — 토큰 이동·카드 보충·귀족 획득.
//
// 핵심 불변식: 연출은 이미 커밋된 최종 화면 위에 얹히는 **순수 장식**이다. 보드/패널의
// 실제 DOM은 committed 상태 그대로이고, 나는 것은 레이어 안의 일회용 칩·짧은 강조뿐이라
// 연타·리사이즈 중에도 최종 표시 상태는 언제나 committed와 일치한다 (M7 DoD).
// reduced-motion(또는 matchMedia 없는 테스트 환경)이면 아무 것도 하지 않는다 → 무연출 경로.

import { useEffect, useRef } from 'react'
import { TOKEN_COLORS, type GameEvent, type TokenColor } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { gemSvgMarkup } from './GemIcon'

interface Point {
  x: number
  y: number
}

function centerOf(el: Element): Point {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** 공급처 ↔ 플레이어 패널 사이를 나는 일회용 보석 칩 */
function flyGem(layer: HTMLElement, color: TokenColor, from: Point, to: Point, delayMs: number) {
  const chip = document.createElement('div')
  chip.className = 'fly-gem'
  chip.setAttribute('aria-hidden', 'true')
  chip.innerHTML = gemSvgMarkup(color, 22)
  chip.style.left = `${from.x}px`
  chip.style.top = `${from.y}px`
  layer.appendChild(chip)

  if (typeof chip.animate !== 'function') {
    chip.remove()
    return
  }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const anim = chip.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.55)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.18 },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`,
        opacity: 0,
      },
    ],
    { duration: 480, delay: delayMs, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
  )
  const cleanup = () => chip.remove()
  anim.onfinish = cleanup
  anim.oncancel = cleanup
}

/** 제자리 강조 — fill 없음이라 끝나면 committed 스타일로 되돌아간다 */
function pulse(el: Element | null, keyframes: Keyframe[], duration: number) {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return
  ;(el as HTMLElement).animate(keyframes, { duration, easing: 'ease-out' })
}

function runEventAnimations(layer: HTMLElement, events: readonly GameEvent[]) {
  for (const ev of events) {
    if (ev.t === 'tokensTaken' || ev.t === 'tokensReturned') {
      const panel = document.querySelector(`[data-player-index="${ev.player}"]`)
      if (!panel) continue
      const panelC = centerOf(panel)
      let idx = 0
      for (const color of TOKEN_COLORS) {
        const n = ev.tokens[color]
        if (n <= 0) continue
        const pile = document.querySelector(`.token-supply .token-${color}`)
        if (!pile) continue
        const pileC = centerOf(pile)
        const [from, to] = ev.t === 'tokensTaken' ? [pileC, panelC] : [panelC, pileC]
        for (let k = 0; k < n; k++) flyGem(layer, color, from, to, idx++ * 70)
      }
    } else if (ev.t === 'slotRefilled' && ev.cardId !== null) {
      // 새로 공개된 카드가 부드럽게 등장
      const card = document.querySelector(`[data-card-id="${ev.cardId}"]`)
      pulse(
        card,
        [
          { transform: 'scale(0.72)', opacity: 0.25 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        420,
      )
    } else if (ev.t === 'nobleVisited') {
      // 귀족을 맞이한 플레이어 패널을 잠깐 금빛으로 강조
      const panel = document.querySelector(`[data-player-index="${ev.player}"]`)
      pulse(
        panel,
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.04)', filter: 'brightness(1.3)', offset: 0.3 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        620,
      )
    }
  }
}

/**
 * 연출 레이어 — lastEvents(직전 액션의 이벤트 묶음)를 소비한다.
 * 모달 백드롭(z-index 40)보다 아래에 있어 핸드오프 중에는 자연히 가려진다.
 */
export function FlyLayer() {
  const layerRef = useRef<HTMLDivElement>(null)
  const lastEvents = useGameStore((s) => s.lastEvents)
  const reduced = useReducedMotion()
  const seen = useRef<readonly GameEvent[] | null>(null)

  useEffect(() => {
    if (reduced || lastEvents.length === 0) return
    // 같은 이벤트 묶음(동일 배열 참조)에 대한 중복 재생 방지 (StrictMode 재실행 포함)
    if (seen.current === lastEvents) return
    seen.current = lastEvents
    const layer = layerRef.current
    if (layer) runEventAnimations(layer, lastEvents)
  }, [lastEvents, reduced])

  return <div className="fly-layer" aria-hidden="true" ref={layerRef} />
}
