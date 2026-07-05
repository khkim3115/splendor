// policy-consistency 계약 (docs/AI_DESIGN.md §4.3):
// (a) 정책 출력은 legalActions의 원소다
// (b) 탐색의 자동 해소(applyResolved)와 실전 응답이 동일한 정책 함수를 쓴다

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { hashState } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import { isLegal, legalActions } from '../../src/engine/legal'
import type { GameState } from '../../src/engine/types'
import { discardPolicy, noblePolicy } from '../../src/ai/policies'
import { applyResolved } from '../../src/ai/search'
import { config } from '../helpers'

/** 무작위 완주 중 discard/chooseNoble phase 상태들을 채집 */
function collectPhaseStates(seedCount: number): {
  discard: GameState[]
  chooseNoble: GameState[]
} {
  const discard: GameState[] = []
  const chooseNoble: GameState[] = []
  for (let seed = 0; seed < seedCount; seed++) {
    let s = setupGame(config(2 + (seed % 3), seed))
    let rng: RngState = createRng(seed ^ 0x7d1)
    for (let step = 0; step < 800 && s.phase.kind !== 'gameOver'; step++) {
      if (s.phase.kind === 'discard') discard.push(s)
      if (s.phase.kind === 'chooseNoble') chooseNoble.push(s)
      const legal = legalActions(s)
      const [i, next] = nextInt(rng, legal.length)
      rng = next
      s = applyAction(s, legal[i]!).state
    }
  }
  return { discard, chooseNoble }
}

describe('policy-consistency', () => {
  const states = collectPhaseStates(40)

  it(`discardPolicy 출력은 항상 legalActions의 원소다 (${states.discard.length}개 국면)`, () => {
    expect(states.discard.length).toBeGreaterThan(20) // 채집이 실제로 됐는지
    for (const s of states.discard) {
      const action = discardPolicy(s, s.currentPlayer)
      expect(isLegal(s, action), hashState(s)).toBe(true)
      const keys = new Set(legalActions(s).map((a) => JSON.stringify(a)))
      expect(keys.has(JSON.stringify(action))).toBe(true)
    }
  })

  it(`noblePolicy 출력은 항상 legalActions의 원소다 (${states.chooseNoble.length}개 국면)`, () => {
    for (const s of states.chooseNoble) {
      const action = noblePolicy(s, s.currentPlayer)
      expect(isLegal(s, action)).toBe(true)
      const keys = new Set(legalActions(s).map((a) => JSON.stringify(a)))
      expect(keys.has(JSON.stringify(action))).toBe(true)
    }
  })

  it('applyResolved의 자동 해소 결과 = 정책 함수를 수동 적용한 결과 (동일 함수 계약)', () => {
    // discard를 유발하는 play 상태를 찾아 비교
    let verified = 0
    for (let seed = 100; seed < 130 && verified < 10; seed++) {
      let s = setupGame(config(2, seed))
      let rng: RngState = createRng(seed)
      for (let step = 0; step < 400 && s.phase.kind !== 'gameOver'; step++) {
        if (s.phase.kind === 'play') {
          for (const a of legalActions(s)) {
            const mid = applyAction(s, a).state
            if (mid.phase.kind === 'discard' || mid.phase.kind === 'chooseNoble') {
              // 수동 해소 (같은 정책 함수)
              let manual = mid
              while (manual.phase.kind === 'discard' || manual.phase.kind === 'chooseNoble') {
                const auto =
                  manual.phase.kind === 'discard'
                    ? discardPolicy(manual, manual.currentPlayer)
                    : noblePolicy(manual, manual.currentPlayer)
                manual = applyAction(manual, auto).state
              }
              expect(hashState(applyResolved(s, a))).toBe(hashState(manual))
              verified++
              break
            }
          }
        }
        const legal = legalActions(s)
        const [i, next] = nextInt(rng, legal.length)
        rng = next
        s = applyAction(s, legal[i]!).state
      }
    }
    expect(verified).toBeGreaterThanOrEqual(5)
  })
})
