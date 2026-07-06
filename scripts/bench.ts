// 탐색 성능 벤치 (docs/AI_DESIGN.md §4.4, ROADMAP M6)
// apply 단가·clone 단가·시뮬레이션/초를 측정하고 수용 하한(800 sim/s) 판정을 출력한다.
// 실행: npm run bench
//
// 사다리 판정 규칙: 시뮬레이션/초가
//   - 2,000 이상: 목표 달성 (L0로 충분)
//   - 800~2,000: 수용 — L1 설정(플레이아웃 깊이 6 + TAKE 프루닝)을 유지/기록
//   - 800 미만: L1로도 미달 → L2(3-ply max-n) 검토
// 결과는 커밋 메시지에 기록한다.

import { applyAction } from '../src/engine/apply'
import { legalActions } from '../src/engine/legal'
import { playerView } from '../src/engine/view'
import { setupGame } from '../src/engine/setup'
import { setStateFreezing } from '../src/engine/freeze'
import { createRng, nextInt, type RngState } from '../src/engine/rng'
import type { Action, GameState } from '../src/engine/types'
import { evaluate } from '../src/ai/evaluate'
import { MCTS_TUNING, mctsChoose } from '../src/ai/mcts'
import { applyResolved } from '../src/ai/search'

setStateFreezing(false) // L0: 벤치는 프로덕션 Worker와 같은 조건

function config(playerCount: number, seed: number) {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      type: 'ai' as const,
      name: `P${i}`,
      difficulty: 'normal' as const,
    })),
    seed,
  }
}

/** 무작위 진행으로 중반 국면 채집 (play phase만) */
function sampleStates(count: number, playerCount: number): GameState[] {
  const out: GameState[] = []
  for (let seed = 0; out.length < count; seed++) {
    let s = setupGame(config(playerCount, seed * 17 + 3))
    let rng: RngState = createRng(seed ^ 0xbe9c4)
    for (let step = 0; step < 24 && s.phase.kind !== 'gameOver'; step++) {
      const legal = legalActions(s)
      const [i, next] = nextInt(rng, legal.length)
      rng = next
      s = applyAction(s, legal[i]!).state
    }
    if (s.phase.kind === 'play') out.push(s)
  }
  return out
}

function measureUs(label: string, iters: number, fn: (i: number) => void): number {
  // 워밍업
  for (let i = 0; i < Math.min(iters, 200); i++) fn(i)
  const start = performance.now()
  for (let i = 0; i < iters; i++) fn(i)
  const us = ((performance.now() - start) / iters) * 1000
  console.log(`${label.padEnd(34)} ${us.toFixed(2).padStart(9)} µs/call`)
  return us
}

const states = sampleStates(40, 2)
const pairs: { state: GameState; action: Action }[] = states.flatMap((s) =>
  legalActions(s).map((action) => ({ state: s, action })),
)
console.log(`측정 국면 ${states.length}개 (2인전 중반), (state, action) 쌍 ${pairs.length}개\n`)

console.log('— 마이크로 벤치 (엔진 단가) —')
measureUs('applyAction', 20_000, (i) => {
  const p = pairs[i % pairs.length]!
  applyAction(p.state, p.action)
})
measureUs('applyResolved (phase 붕괴 포함)', 20_000, (i) => {
  const p = pairs[i % pairs.length]!
  applyResolved(p.state, p.action)
})
measureUs('legalActions', 5_000, (i) => {
  legalActions(states[i % states.length]!)
})
measureUs('evaluate(full)', 20_000, (i) => {
  evaluate(states[i % states.length]!, 0, 'full')
})
measureUs('JSON clone (직렬화 왕복)', 2_000, (i) => {
  JSON.parse(JSON.stringify(states[i % states.length]!)) as GameState
})

console.log('\n— MCTS 시뮬레이션/초 (mctsChoose, 뷰 기준) —')
const budgetMs = Number(process.argv.find((a) => a.startsWith('--budget='))?.slice(9) ?? 1000)

function benchMcts(label: string): number {
  const perState: number[] = []
  for (const [i, s] of states.slice(0, 10).entries()) {
    const view = playerView(s, s.currentPlayer)
    const [, , stats] = mctsChoose(view, s.currentPlayer, budgetMs, createRng(i))
    perState.push((stats.iters / stats.elapsedMs) * 1000)
  }
  const avg = perState.reduce((a, b) => a + b, 0) / perState.length
  const min = Math.min(...perState)
  const max = Math.max(...perState)
  console.log(
    `${label.padEnd(34)} 평균 ${Math.round(avg).toString().padStart(6)} sim/s (최저 ${Math.round(min)}, 최고 ${Math.round(max)}, 예산 ${budgetMs}ms × 10국면)`,
  )
  return avg
}

const l1Defaults = { ...MCTS_TUNING }
// L0 조건: 플레이아웃 깊이 10, 프루닝 없음 (§4.4 표의 원안)
Object.assign(MCTS_TUNING, { playoutDepth: 10, prunePlayoutTakes: false })
const l0 = benchMcts('L0 (깊이 10, 프루닝 없음)')
// L1 조건: 깊이 6 + TAKE_DIFFERENT 프루닝
Object.assign(MCTS_TUNING, l1Defaults, { playoutDepth: 6, prunePlayoutTakes: true })
const l1 = benchMcts('L1 (깊이 6 + TAKE 프루닝)')
Object.assign(MCTS_TUNING, l1Defaults)

console.log('\n— 판정 (목표 2,000 / 수용 하한 800 sim/s) —')
const verdict = (v: number): string => (v >= 2000 ? '목표 달성' : v >= 800 ? '수용' : '미달')
console.log(`L0: ${Math.round(l0)} sim/s → ${verdict(l0)}`)
console.log(`L1: ${Math.round(l1)} sim/s → ${verdict(l1)}`)
if (l0 >= 800) {
  console.log('결론: L0만으로 수용 하한 이상 — L1은 품질 트레이드오프 판단에 따라 선택.')
} else if (l1 >= 800) {
  console.log('결론: L1 적용으로 수용 하한 충족 — MCTS_TUNING 기본값을 L1로 유지한다.')
} else {
  console.log('결론: L1로도 미달 — §4.4 L2(3-ply max-n) 검토 필요.')
}
