// 하드가드 (docs/AI_DESIGN.md §3) — 가드 발동 조건과 우선순위를 고정한다

import { describe, expect, it } from 'vitest'
import { canonicalPayment } from '../../src/engine/payment'
import { CARDS } from '../../src/engine/data/cards'
import { tokenTotal } from '../../src/engine/tokens'
import type { Difficulty } from '../../src/engine/types'
import { createRng } from '../../src/engine/rng'
import { legalActions } from '../../src/engine/legal'
import { hardGuard } from '../../src/ai/guards'
import { chooseActionSync } from '../../src/ai/greedy'
import { applyResolved } from '../../src/ai/search'
import { baseState, findCard, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal']

describe('하드가드', () => {
  it('즉시 15점 이상을 확정하는 구매는 전 난이도가 무조건 선택한다', () => {
    const winner = findCard((c) => c.tier === 3 && c.points === 5)
    let s = placeOnBoard(baseState(2), winner.id)
    s = patchPlayer(s, 0, {
      prestige: 10,
      tokens: tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7 }),
    })

    const guarded = hardGuard(s, 0)
    expect(guarded).toEqual({
      type: 'PURCHASE',
      cardId: winner.id,
      payment: canonicalPayment(s.players[0]!, winner),
    })

    for (const difficulty of DIFFICULTIES) {
      for (let seed = 0; seed < 5; seed++) {
        const [action] = chooseActionSync(s, 0, difficulty, createRng(seed))
        expect(action.type === 'PURCHASE' && action.cardId === winner.id, difficulty).toBe(true)
      }
    }
  })

  it('여러 즉승 구매 중 도달 점수가 가장 높은 쪽을 고른다', () => {
    const five = findCard((c) => c.tier === 3 && c.points === 5)
    let s = placeOnBoard(baseState(2), five.id) // 5점 즉승 후보가 최소 1장 보장
    s = patchPlayer(s, 0, {
      prestige: 11,
      tokens: tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7 }),
    })
    const guarded = hardGuard(s, 0)
    expect(guarded?.type).toBe('PURCHASE')
    if (guarded?.type === 'PURCHASE') {
      // 보드의 모든 즉승 구매 중 최고 도달 점수와 일치해야 한다
      const reachable = legalActions(s)
        .filter((a) => a.type === 'PURCHASE')
        .map((a) => applyResolved(s, a).players[0]!.prestige)
      const best = Math.max(...reachable)
      expect(best).toBeGreaterThanOrEqual(16) // 11 + 5점 카드
      expect(applyResolved(s, guarded).players[0]!.prestige).toBe(best)
    }
  })

  it('실지불 0의 1점 이상 카드는 놓치지 않는다 (전액 보너스 커버)', () => {
    const free = findCard((c) => c.tier === 1 && c.points === 1)
    let s = placeOnBoard(baseState(2), free.id)
    s = patchPlayer(s, 0, { bonuses: gems({ white: 4, blue: 4, green: 4, red: 4, black: 4 }) })

    // 보드의 다른 무료 카드가 더 높은 점수일 수 있으므로 속성으로 검증한다
    const guarded = hardGuard(s, 0)
    expect(guarded?.type).toBe('PURCHASE')
    if (guarded?.type === 'PURCHASE') {
      expect(tokenTotal(guarded.payment)).toBe(0)
      expect(CARDS[guarded.cardId]!.points).toBeGreaterThanOrEqual(1)
    }
  })

  it('가드 조건이 없으면 null — 탐색이 결정한다', () => {
    expect(hardGuard(baseState(2), 0)).toBeNull()
  })

  it("무료 구매가 '평가 손해'면 강제하지 않는다 — 4점 유료 구매를 가로채지 않는다 (§3)", () => {
    // 무료 1점 카드(green 4 비용, green 보너스 4로 전액 커버)와
    // 즉시 구매 가능한 4점 카드(white 7)가 공존하는 상태
    const freeCard = findCard((c) => c.tier === 1 && c.points === 1 && c.cost.green === 4)
    const bigCard = findCard((c) => c.tier === 3 && c.points === 4 && c.cost.white === 7)
    let s = placeOnBoard(placeOnBoard(baseState(2), freeCard.id), bigCard.id)
    s = patchPlayer(s, 0, {
      bonuses: gems({ green: 4 }),
      tokens: tokens({ white: 7 }),
    })
    // 두 카드가 실제로 공존하는지 확인 (placeOnBoard는 티어가 달라 안전)
    expect(s.board.flat()).toContain(freeCard.id)
    expect(s.board.flat()).toContain(bigCard.id)

    expect(hardGuard(s, 0)).toBeNull() // 무료 1점 < 유료 4점 — 가드 미발동
    for (let seed = 0; seed < 5; seed++) {
      const [action] = chooseActionSync(s, 0, 'normal', createRng(seed))
      expect(action.type === 'PURCHASE' && action.cardId === bigCard.id, `seed ${seed}`).toBe(
        true,
      )
    }
  })
})
