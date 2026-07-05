// determinize 마스킹 보존 (docs/AI_DESIGN.md §4.2):
// 마스킹된 정보(덱 내용, 타인의 덱 비공개 예약) 외에는 아무것도 변경하지 않는다

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import { HIDDEN_CARD } from '../../src/engine/types'
import { determinize } from '../../src/ai/moveGen'
import { config } from '../helpers'

describe('determinize', () => {
  it('가시 정보는 그대로, 마스킹 구간만 유효한 카드로 결정화된다 (50개 국면)', () => {
    let rng: RngState = createRng(0xd17)
    for (let seed = 0; seed < 10; seed++) {
      // 비공개 예약이 생기도록 무작위 진행
      let s = setupGame(config(2 + (seed % 3), seed))
      let walk: RngState = createRng(seed)
      for (let step = 0; step < 40 && s.phase.kind !== 'gameOver'; step++) {
        const legal = legalActions(s)
        const [i, next] = nextInt(walk, legal.length)
        walk = next
        s = applyAction(s, legal[i]!).state
      }

      for (let viewer = 0; viewer < s.players.length; viewer++) {
        const view = playerView(s, viewer)
        const [det, next] = determinize(view, rng)
        rng = next

        // 가시 정보 보존
        expect(det.board).toEqual(view.board)
        expect(det.supply).toEqual(view.supply)
        expect(det.nobles).toEqual(view.nobles)
        expect(det.currentPlayer).toBe(view.currentPlayer)
        for (const [i, p] of det.players.entries()) {
          expect(p.tokens).toEqual(view.players[i]!.tokens)
          expect(p.purchased).toEqual(view.players[i]!.purchased)
          expect(p.prestige).toBe(view.players[i]!.prestige)
        }

        // HIDDEN이 전부 해소되고 덱 길이가 유지된다
        for (const t of [0, 1, 2]) {
          expect(det.decks[t]).toHaveLength(view.decks[t]!.length)
          expect(det.decks[t]!.every((c) => c >= 0)).toBe(true)
        }
        for (const p of det.players) {
          expect(p.reserved.every((r) => r.cardId >= 0)).toBe(true)
        }

        // 카드 90장 분할 복원 (진짜 상태와 같은 불변식)
        const ids = [
          ...det.decks.flat(),
          ...det.board.flat().filter((c): c is number => c !== null),
          ...det.players.flatMap((p) => p.purchased),
          ...det.players.flatMap((p) => p.reserved.map((r) => r.cardId)),
        ].sort((a, b) => a - b)
        expect(ids).toHaveLength(90)
        expect(ids.every((id, i) => id === i)).toBe(true)

        // 원본 뷰는 변형되지 않는다
        expect(view.decks[0]!.every((c) => c === HIDDEN_CARD)).toBe(true)
      }
    }
  })

  it('같은 시드는 같은 결정화, 다른 시드는 (거의 확실히) 다른 결정화', () => {
    let s = setupGame(config(2, 5))
    s = applyAction(s, { type: 'RESERVE_DECK', tier: 1 }).state
    const view = playerView(s, 1) // 상대 시점 — P0의 예약이 HIDDEN

    const [a] = determinize(view, createRng(1))
    const [b] = determinize(view, createRng(1))
    const [c] = determinize(view, createRng(2))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })
})
