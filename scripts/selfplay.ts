// 자가대전 매트릭스 (docs/AI_DESIGN.md §6.1, ROADMAP M6)
// 기준: 인접 난이도 간 상위 승률 65~80% (2인전, 선후공 교대)
//
// 실행 예:
//   npm run selfplay -- --pair hard:normal --games 200 --hard-budget 150
//   npm run selfplay -- --pair normal:easy --games 200
//   npm run selfplay -- --smoke 50 --hard-budget 100   (3~4인 혼합 스모크)
//
// 어려움 예산 기본 150ms: 서열 검증에는 충분하며(§6.1 arena 정책) 200판을
// 로컬에서 완주 가능한 시간으로 만든다. 정밀 측정은 --hard-budget 1000.

import { applyAction } from '../src/engine/apply'
import { playerView } from '../src/engine/view'
import { setupGame } from '../src/engine/setup'
import { setStateFreezing } from '../src/engine/freeze'
import { createRng, type RngState } from '../src/engine/rng'
import type { Difficulty, GameConfig } from '../src/engine/types'
import { chooseActionSync } from '../src/ai/greedy'
import { createHardAgent, type HardAgent } from '../src/ai/mcts'

setStateFreezing(false)

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (found) return found.slice(name.length + 3)
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const HARD_BUDGET_MS = Number(arg('hard-budget') ?? 150)

interface MatchResult {
  winners: readonly number[]
  turns: number
  hardIters: number
  hardMoves: number
}

function playMatch(seed: number, seats: readonly Difficulty[]): MatchResult {
  const gameConfig: GameConfig = {
    players: seats.map((difficulty, i) => ({ type: 'ai', name: `${difficulty}${i}`, difficulty })),
    seed,
  }
  let s = setupGame(gameConfig)
  let rng: RngState = createRng(seed ^ 0xa1e4a)
  const hardAgents = new Map<number, HardAgent>()
  for (const [i, d] of seats.entries()) {
    if (d === 'hard') hardAgents.set(i, createHardAgent())
  }

  let hardIters = 0
  let hardMoves = 0
  for (let step = 0; step < 2000; step++) {
    if (s.phase.kind === 'gameOver') {
      return { winners: s.phase.result.winners, turns: s.turn, hardIters, hardMoves }
    }
    const me = s.currentPlayer
    const view = playerView(s, me)
    const agent = hardAgents.get(me)
    if (agent) {
      const [action, next, stats] = agent.chooseAction(view, me, HARD_BUDGET_MS, rng)
      rng = next
      hardIters += stats.iters
      if (s.phase.kind === 'play') hardMoves++
      s = applyAction(s, action).state
    } else {
      const [action, next] = chooseActionSync(view, me, seats[me]!, rng)
      rng = next
      s = applyAction(s, action).state
    }
  }
  throw new Error(`시드 ${seed}: 2000스텝 내에 게임이 끝나지 않았습니다`)
}

function runPair(upper: Difficulty, lower: Difficulty, games: number, seedBase: number): void {
  console.log(
    `\n=== ${upper} vs ${lower} — ${games}판, 선후공 교대, hard 예산 ${HARD_BUDGET_MS}ms ===`,
  )
  const started = performance.now()
  let upperWins = 0
  let ties = 0
  let totalTurns = 0
  let hardIters = 0
  let hardMoves = 0
  for (let g = 0; g < games; g++) {
    const upperSeat = g % 2
    const seats: Difficulty[] = upperSeat === 0 ? [upper, lower] : [lower, upper]
    const r = playMatch(seedBase + g, seats)
    if (r.winners.length === seats.length) ties++
    else if (r.winners[0] === upperSeat) upperWins++
    totalTurns += r.turns
    hardIters += r.hardIters
    hardMoves += r.hardMoves
    if ((g + 1) % 20 === 0) {
      const decided = g + 1 - ties
      console.log(
        `  ${g + 1}판: ${upper} ${upperWins}승 (${((upperWins / Math.max(1, decided)) * 100).toFixed(1)}%), 무승부 ${ties}`,
      )
    }
  }
  const decisive = games - ties
  const rate = upperWins / Math.max(1, decisive)
  const mins = ((performance.now() - started) / 60_000).toFixed(1)
  console.log(`\n[결과] ${upper} 승률: ${(rate * 100).toFixed(1)}% (${upperWins}/${decisive}, 무승부 ${ties})`)
  console.log(`평균 턴 수: ${(totalTurns / games).toFixed(1)}, 소요 ${mins}분`)
  if (hardMoves > 0) {
    console.log(`hard 평균 시뮬레이션/수: ${Math.round(hardIters / hardMoves)}`)
  }
  const band = rate >= 0.65 && rate <= 0.8 ? '밴드 내 (65~80%)' : rate > 0.8 ? '밴드 상한 초과' : '기준(65%) 미달'
  console.log(`판정: ${band}`)
}

function runSmoke(games: number, seedBase: number): void {
  console.log(`\n=== 3~4인 혼합 난이도 스모크 ${games}판 (hard 예산 ${HARD_BUDGET_MS}ms) ===`)
  const started = performance.now()
  const winsByDifficulty: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0 }
  const pool: Difficulty[] = ['hard', 'normal', 'easy', 'normal']
  let completed = 0
  for (let g = 0; g < games; g++) {
    const count = 3 + (g % 2)
    const seats = Array.from({ length: count }, (_, i) => pool[(g + i) % pool.length]!)
    const r = playMatch(seedBase + g, seats)
    for (const w of r.winners) winsByDifficulty[seats[w]!]++
    completed++
    if ((g + 1) % 10 === 0) console.log(`  ${g + 1}/${games}판 완료`)
  }
  const mins = ((performance.now() - started) / 60_000).toFixed(1)
  console.log(`\n[결과] ${completed}/${games}판 정상 종료 (소요 ${mins}분)`)
  console.log(
    `난이도별 승수(공동 승리 포함): hard ${winsByDifficulty.hard}, normal ${winsByDifficulty.normal}, easy ${winsByDifficulty.easy}`,
  )
}

const games = Number(arg('games') ?? 200)
const seedBase = Number(arg('seed') ?? 9000)
const smoke = arg('smoke')
const pair = arg('pair')

if (smoke !== undefined) {
  runSmoke(Number(smoke || 50), seedBase)
} else if (process.argv.includes('--matrix')) {
  runPair('hard', 'normal', games, seedBase)
  runPair('normal', 'easy', games, seedBase + 100_000)
} else {
  const [upper, lower] = (pair ?? 'hard:normal').split(':') as [Difficulty, Difficulty]
  runPair(upper, lower, games, seedBase)
}
