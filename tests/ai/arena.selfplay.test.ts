// 자가대전 아레나 초안 (docs/AI_DESIGN.md §6.1, M5 DoD)
// 실행: SELFPLAY=1 npx vitest run tests/ai/arena.selfplay.test.ts
// (CI 게이트 아님 — 로컬 검증용. 기준: 보통 > 쉬움 승률 65~80%)

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import { createRng, type RngState } from '../../src/engine/rng'
import type { Difficulty, GameConfig } from '../../src/engine/types'
import { chooseActionSync } from '../../src/ai/greedy'

function playMatch(seed: number, seatDifficulty: readonly [Difficulty, Difficulty]): number[] {
  const config: GameConfig = {
    players: [
      { type: 'ai', name: 'A', difficulty: seatDifficulty[0] },
      { type: 'ai', name: 'B', difficulty: seatDifficulty[1] },
    ],
    seed,
  }
  let s = setupGame(config)
  let rng: RngState = createRng(seed ^ 0xa1e4a)
  for (let step = 0; step < 1500; step++) {
    if (s.phase.kind === 'gameOver') return [...s.phase.result.winners]
    const difficulty = seatDifficulty[s.currentPlayer as 0 | 1]
    const [action, next] = chooseActionSync(playerView(s, s.currentPlayer), s.currentPlayer, difficulty, rng)
    rng = next
    s = applyAction(s, action).state
  }
  throw new Error(`시드 ${seed}: 게임이 끝나지 않았습니다`)
}

describe('자가대전 아레나', () => {
  it.runIf(process.env.SELFPLAY === '1')(
    '보통 > 쉬움 승률 65% 이상 (2인전 200판, 선후공 교대)',
    { timeout: 1_800_000 },
    () => {
      const GAMES = 200
      let normalWins = 0
      let ties = 0
      let totalTurns = 0
      for (let g = 0; g < GAMES; g++) {
        const normalSeat = g % 2 // 선후공 교대
        const seats: [Difficulty, Difficulty] =
          normalSeat === 0 ? ['normal', 'easy'] : ['easy', 'normal']
        const winners = playMatch(9000 + g, seats)
        if (winners.length === 2) ties++
        else if (winners[0] === normalSeat) normalWins++
        totalTurns++
      }
      const decisive = GAMES - ties
      const rate = normalWins / decisive
      console.log(
        `[arena] 보통 승률: ${(rate * 100).toFixed(1)}% (${normalWins}/${decisive}, 무승부 ${ties}, 총 ${totalTurns}판)`,
      )
      expect(rate).toBeGreaterThanOrEqual(0.65)
    },
  )

  it.runIf(process.env.SELFPLAY !== '1')('아레나는 SELFPLAY=1로 로컬 실행 (CI 비차단)', () => {
    expect(true).toBe(true)
  })
})
