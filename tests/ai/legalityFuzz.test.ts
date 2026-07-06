// legality fuzz (docs/AI_DESIGN.md §6.3-3):
// 난이도×다양한 국면(진짜 상태 + 마스킹 뷰, 전 phase)에서 AI가 항상 합법 수를 반환한다

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { isLegal, legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import type { GameState } from '../../src/engine/types'
import { chooseActionSync } from '../../src/ai/greedy'
import { mctsChoose } from '../../src/ai/mcts'
import { config } from '../helpers'

function sampleStates(games: number, everyN: number): GameState[] {
  const out: GameState[] = []
  for (let seed = 0; seed < games; seed++) {
    let s = setupGame(config(2 + (seed % 3), seed * 31 + 7))
    let rng: RngState = createRng(seed ^ 0x5ca1ab1e)
    for (let step = 0; step < 600 && s.phase.kind !== 'gameOver'; step++) {
      if (step % everyN === 0) out.push(s)
      const legal = legalActions(s)
      const [i, next] = nextInt(rng, legal.length)
      rng = next
      s = applyAction(s, legal[i]!).state
    }
  }
  return out
}

describe('AI legality fuzz', () => {
  it('쉬움: 수백 국면(마스킹 뷰 포함)에서 항상 합법 수를 반환한다', { timeout: 60_000 }, () => {
    const states = sampleStates(30, 4)
    expect(states.length).toBeGreaterThan(400)
    let rng: RngState = createRng(1)
    for (const s of states) {
      const view = playerView(s, s.currentPlayer)
      const [action, next] = chooseActionSync(view, s.currentPlayer, 'easy', rng)
      rng = next
      // 뷰에서 고른 수는 진짜 상태에서도 합법이어야 한다 (자기 정보는 마스킹되지 않으므로)
      expect(isLegal(s, action), JSON.stringify({ action, phase: s.phase.kind })).toBe(true)
    }
  })

  it('보통: 수십 국면에서 항상 합법 수를 반환한다 (determinize 경유)', { timeout: 120_000 }, () => {
    const states = sampleStates(8, 12)
    let rng: RngState = createRng(2)
    let checked = 0
    for (const s of states) {
      if (checked >= 80) break
      const view = playerView(s, s.currentPlayer)
      const [action, next] = chooseActionSync(view, s.currentPlayer, 'normal', rng)
      rng = next
      expect(isLegal(s, action), JSON.stringify({ action, phase: s.phase.kind })).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(60)
  })

  it('어려움(MCTS): 수십 국면(전 phase)에서 항상 합법 수를 반환한다', { timeout: 120_000 }, () => {
    // 시간 체크가 32회 간격(mcts.ts TIME_CHECK_MASK)이라 짧은 예산만으로는 한 배치
    // (~83ms)를 다 돌 수 있다 — 짧은 예산 + maxIters(테스트 전용 옵션)로 상한을 건다.
    const states = sampleStates(6, 16)
    let rng: RngState = createRng(4)
    let checked = 0
    for (const s of states) {
      if (checked >= 40) break
      const view = playerView(s, s.currentPlayer)
      const [action, next] = mctsChoose(view, s.currentPlayer, 10, rng, { maxIters: 12 })
      rng = next
      expect(isLegal(s, action), JSON.stringify({ action, phase: s.phase.kind })).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(30)
  })

  it('공급 고갈·예약 가득 극단 국면에서도 합법 수를 반환한다', () => {
    // 교착 직전 상태 — PASS만 합법
    let s = setupGame(config(2, 9))
    s = {
      ...s,
      supply: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
      players: s.players.map((p, i) => ({
        ...p,
        reserved: [
          { cardId: s.decks[2]![i * 3]!, fromDeck: true },
          { cardId: s.decks[2]![i * 3 + 1]!, fromDeck: true },
          { cardId: s.decks[2]![i * 3 + 2]!, fromDeck: true },
        ],
      })),
      currentPlayer: 0,
      startPlayer: 0,
    }
    for (const difficulty of ['easy', 'normal'] as const) {
      const [action] = chooseActionSync(playerView(s, 0), 0, difficulty, createRng(3))
      expect(isLegal(s, action)).toBe(true)
    }
    // 어려움(MCTS)도 같은 극단 국면에서 합법 수(PASS만 가능)를 반환한다
    const [action] = mctsChoose(playerView(s, 0), 0, 10, createRng(3), { maxIters: 4 })
    expect(isLegal(s, action)).toBe(true)
  })
})
