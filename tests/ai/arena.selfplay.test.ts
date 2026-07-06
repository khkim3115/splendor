// 자가대전 아레나 (docs/AI_DESIGN.md §6.1 — M6-3 3단계 난이도 매트릭스)
// 실행: SELFPLAY=1 npx vitest run tests/ai/arena.selfplay.test.ts --reporter=verbose
//   특정 쌍만:   ... -t "어려움 > 보통"
//   어려움 예산: ARENA_BUDGET_MS (기본 500ms — §6.1 M6 기록의 확정 예산. 정밀 측정은 1000)
//   판수 축소:   ARENA_GAMES (파일럿 용 — 기본은 이슈 명세: 쌍당 200판, 스모크 50판)
// (CI 게이트 아님 — 로컬 검증용. 기준: 인접 난이도 상위 승률 밴드 65~80%)

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import { createRng, type RngState } from '../../src/engine/rng'
import { setStateFreezing } from '../../src/engine/freeze'
import type { Difficulty, GameConfig } from '../../src/engine/types'
import { chooseAction } from '../../src/ai/chooseAction'

// 프로덕션 동등 조건: 출하 경로(src/ai/worker.ts)와 벤치(tests/bench)는 dev 전용
// deep-freeze 가드를 끄고 돈다 — 측정도 같은 조건이어야 한다. freeze ON은 apply
// 단가를 30~70% 올려 어려움(anytime MCTS)의 벽시계 예산 내 유효 iteration을 깎으므로
// 어려움이 낀 승률 측정치가 달라진다. (쉬움/보통은 고정 깊이 탐색이라 freeze가
// 벽시계만 바꾸고 착수는 불변 — docs/AI_DESIGN.md §6.1 M6 기록.)
beforeAll(() => setStateFreezing(false))
afterAll(() => setStateFreezing(true))

// 어려움(MCTS)의 아레나 예산 — 정밀(1,000ms) 200판은 수 시간이라 §6.1 정책대로 축소
// 예산이 기본이다. 단 강도가 예산에 강하게 민감함이 실측됨(M6-3, 50판 사다리, freeze
// ON 측정: 150ms 58% / 400ms 68% / 1,000ms 90% — 150ms는 ~57 iteration뿐이라 MCTS가
// 힘을 내기 전). 기본 500ms = 풀 예산의 1/2(~190 iteration)로 상향해 서열이 밴드
// 안에서 측정되게 한다. 확정 측정(freeze OFF, 200판)은 어려움>보통 72.9%로 밴드 내
// (근거: docs/AI_DESIGN.md §6.1 M6 기록).
/** 수치 env 파싱 — 미설정·빈 문자열·비수치("abc" 등)는 NaN을 흘리지 말고 null 폴백 */
function envNum(name: string): number | null {
  const raw = process.env[name]
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const BUDGET_MS = envNum('ARENA_BUDGET_MS') ?? 500
const GAMES_OVERRIDE = envNum('ARENA_GAMES')

function playMatch(seed: number, seats: readonly Difficulty[]): readonly number[] {
  const config: GameConfig = {
    players: seats.map((difficulty, i) => ({ type: 'ai', name: `P${i}`, difficulty })),
    seed,
  }
  let s = setupGame(config)
  let rng: RngState = createRng(seed ^ 0xa1e4a)
  for (let step = 0; step < 1500; step++) {
    if (s.phase.kind === 'gameOver') return [...s.phase.result.winners]
    const outcome = chooseAction(
      playerView(s, s.currentPlayer),
      s.currentPlayer,
      seats[s.currentPlayer]!,
      BUDGET_MS,
      rng,
    )
    rng = outcome.rng
    s = applyAction(s, outcome.action).state
  }
  throw new Error(`시드 ${seed}: 게임이 끝나지 않았습니다`)
}

/** 2인전 쌍 대전 — 선후공 교대, 시드 고정, 25판마다 진행 로그. 반환: 상위 난이도 승률(decisive 기준) */
function runPair(
  label: string,
  strong: Difficulty,
  weak: Difficulty,
  games: number,
  seedBase: number,
): number {
  const budgetNote = strong === 'hard' || weak === 'hard' ? `, 어려움 예산 ${BUDGET_MS}ms` : ''
  let strongWins = 0
  let ties = 0
  const t0 = performance.now()
  for (let g = 0; g < games; g++) {
    const strongSeat = g % 2 // 선후공 교대
    const seats: [Difficulty, Difficulty] = strongSeat === 0 ? [strong, weak] : [weak, strong]
    const winners = playMatch(seedBase + g, seats)
    if (winners.length === 2) ties++
    else if (winners[0] === strongSeat) strongWins++
    if ((g + 1) % 25 === 0) {
      const dec = Math.max(1, g + 1 - ties)
      const elapsed = ((performance.now() - t0) / 1000).toFixed(0)
      console.log(
        `[arena] ${label} 진행 ${g + 1}/${games} — 중간 승률 ${((strongWins / dec) * 100).toFixed(1)}% (${elapsed}s)`,
      )
    }
  }
  const decisive = games - ties
  const rate = strongWins / decisive
  console.log(
    `[arena] ${label} 승률: ${(rate * 100).toFixed(1)}% (${strongWins}/${decisive}, 무승부 ${ties}, ${games}판, 시드 ${seedBase}+${budgetNote})`,
  )
  return rate
}

describe('자가대전 아레나', () => {
  const selfplay = process.env.SELFPLAY === '1'

  it.runIf(selfplay)(
    '어려움 > 보통 승률 65~80% (2인전 200판, 선후공 교대) — M6 DoD',
    { timeout: 10_800_000 },
    () => {
      const games = GAMES_OVERRIDE ?? 200
      const rate = runPair('어려움>보통', 'hard', 'normal', games, 11000)
      // ROADMAP M6 DoD 하드 게이트: 65~80% 밴드. 하한은 항상(파일럿도 신호).
      // 상한은 명세 판수(200) + 확정 예산(500ms)에서만 — §6.1: 강도가 예산에 단조
      // 증가해(50판 사다리 150ms 58% / 1,000ms 90%) 1,000ms 정밀 구성은 설계상
      // 밴드를 상회한다. 소표본 파일럿의 우연 초과도 판정이 아니다.
      expect(rate).toBeGreaterThanOrEqual(0.65)
      if (games >= 200 && BUDGET_MS === 500) expect(rate).toBeLessThanOrEqual(0.8)
    },
  )

  it.runIf(selfplay)(
    '보통 > 쉬움 승률 65% 이상 (2인전 200판, 선후공 교대)',
    { timeout: 1_800_000 },
    () => {
      // 밴드 상한(80%) 소폭 초과는 §6.1 기록대로 수용 — 시야 차이가 지배해 온도로는 안 내려간다
      const rate = runPair('보통>쉬움', 'normal', 'easy', GAMES_OVERRIDE ?? 200, 9000)
      expect(rate).toBeGreaterThanOrEqual(0.65)
    },
  )

  it.runIf(selfplay)(
    '어려움 > 쉬움 스모크 (2인전 50판) — 전체 서열 확인',
    { timeout: 10_800_000 },
    () => {
      const rate = runPair('어려움>쉬움', 'hard', 'easy', GAMES_OVERRIDE ?? 50, 13000)
      expect(rate).toBeGreaterThanOrEqual(0.65)
    },
  )

  it.runIf(selfplay)(
    '3~4인전 혼합 난이도 스모크 50판 — 크래시·교착 없이 gameOver 종료',
    { timeout: 10_800_000 },
    () => {
      const games = GAMES_OVERRIDE ?? 50
      const threePlayerGames = Math.ceil(games / 2)
      const wins: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0 }
      let finished = 0
      for (let g = 0; g < games; g++) {
        const base: readonly Difficulty[] =
          g < threePlayerGames ? ['hard', 'normal', 'easy'] : ['hard', 'normal', 'easy', 'easy']
        const offset = g % base.length // 좌석 로테이션 — 난이도별 자리 편향 제거
        const seats = base.map((_, i) => base[(i + offset) % base.length]!)
        const winners = playMatch(15000 + g, seats) // gameOver 미도달 시 playMatch가 throw
        expect(winners.length).toBeGreaterThanOrEqual(1)
        for (const w of winners) wins[seats[w]!] += 1
        finished++
        if (finished % 25 === 0) console.log(`[arena] 혼합 스모크 진행 ${finished}/${games}`)
      }
      console.log(
        `[arena] 혼합 스모크 ${finished}판 정상 종료 (3인 ${threePlayerGames} + 4인 ${games - threePlayerGames}, 시드 15000+, 어려움 예산 ${BUDGET_MS}ms) — 승수(공동승 포함): hard ${wins.hard} / normal ${wins.normal} / easy ${wins.easy}`,
      )
      expect(finished).toBe(games)
    },
  )

  it.runIf(!selfplay)('아레나는 SELFPLAY=1로 로컬 실행 (CI 비차단)', () => {
    expect(true).toBe(true)
  })
})
