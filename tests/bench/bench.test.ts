// 성능 벤치마크 (docs/AI_DESIGN.md §4.4, ROADMAP M6) — MCTS 구현 전 탐색 성능 측정.
// 실행: BENCH=1 npx vitest run tests/bench/bench.test.ts  (또는 npm run bench)
// (CI 게이트 아님 — tests/ai/arena.selfplay.test.ts와 동일한 env 가드 정책)
//
// "시뮬레이션 1회"의 정의(컨트롤러 해석, MCTS 구현 전 근사):
//   그리디 플레이아웃 깊이 10 — 각 스텝에서 legalActions(state) 열거 → 각 후보를
//   applyResolved로 적용 → evaluate(after, p, 'full') argmax로 진행.
//   (docs/AI_DESIGN.md §4.1 ③ 플레이아웃 그대로)
//
// 측정 시간원은 performance.now() (저장소 허용 선례, src/ai/worker.ts).
// 무작위성은 전부 엔진 시드 RNG(createRng/nextInt/shuffle) — Math.random/Date.now 금지.

import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createRng,
  deserialize,
  legalActions,
  serialize,
  setStateFreezing,
  setupGame,
  type Action,
  type GameConfig,
  type GameState,
  type RngState,
} from '../../src/engine'
import { evaluate } from '../../src/ai/evaluate'
import { determinize } from '../../src/ai/moveGen'
import { applyResolved } from '../../src/ai/search'

const RUN = process.env.BENCH === '1'

// ---- 벤치 국면 샘플링 ------------------------------------------------------
// 같은 시드 셋업에서 그리디(evaluate argmax) 자가 진행으로 초/중/후반 국면을
// 여러 개 뽑는다(개시 국면만 재면 왜곡). discard phase 경로도 자연히 섞인다
// (M5부터 discard 정책이 평가 argmax라 applyResolved 안에서 이미 밟힌다 — 이슈 참고사항).

/** 그리디 1-ply(evaluate full argmax)로 한 수 진행 — 벤치 전용 자가 진행기 */
function stepGreedy(state: GameState, me: number): GameState {
  const actions = legalActions(state)
  let best = actions[0]!
  let bestScore = -Infinity
  for (const action of actions) {
    const after = applyAction(state, action).state
    const score = evaluate(after, me, 'full')
    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }
  return applyAction(state, best).state
}

/** 시드 seed의 4인 게임을 그리디로 진행하며 turnSamples 시점의 국면을 채집 */
function sampleGames(seed: number, turnsPerGame: number, samplesPerGame: number): GameState[] {
  const config: GameConfig = {
    players: [
      { type: 'human', name: 'A' },
      { type: 'human', name: 'B' },
      { type: 'human', name: 'C' },
      { type: 'human', name: 'D' },
    ],
    seed,
  }
  let s = setupGame(config)
  const samples: GameState[] = []
  const captureEvery = Math.max(1, Math.floor(turnsPerGame / samplesPerGame))
  for (let t = 0; t < turnsPerGame; t++) {
    if (s.phase.kind === 'gameOver') break
    if (t % captureEvery === 0) samples.push(s)
    const me = s.currentPlayer
    s = stepGreedy(s, me)
  }
  return samples
}

/** 국면 여러 개 — 초/중/후반 섞이도록 여러 시드에서 얕게, 한 시드에서 깊게 채집 */
function benchPositions(): GameState[] {
  const positions: GameState[] = []
  for (const seed of [1, 2, 3, 4, 5]) {
    positions.push(...sampleGames(seed, 60, 6))
  }
  return positions
}

// ---- 마이크로 벤치 유틸 -----------------------------------------------------

interface TimingResult {
  totalMs: number
  count: number
  usPerOp: number
}

function timeIt(count: number, f: () => void): TimingResult {
  const started = performance.now()
  for (let i = 0; i < count; i++) f()
  const totalMs = performance.now() - started
  return { totalMs, count, usPerOp: (totalMs * 1000) / count }
}

/** µs/회 단가를 초당 처리량으로 환산 (1초 = 1,000,000 µs) */
function perSecFromUs(usPerOp: number): number {
  return 1_000_000 / usPerOp
}

// ---- 플레이아웃(§4.1 ③) -----------------------------------------------------

interface PlayoutOptions {
  /** L1 변형: 후보를 1-ply 평가로 정렬해 상위 k만 적용 대상으로 남긴다 */
  topK?: number
  /** L1 변형: TAKE_DIFFERENT 조합을 절반으로 프루닝(정렬 후 앞쪽 절반만 유지) */
  pruneTakeDifferent?: boolean
}

/**
 * 그리디 플레이아웃 1회: depth 스텝, 각 스텝 legalActions 전 열거 + applyResolved + evaluate argmax.
 * 매 스텝 "현재 차례 플레이어" 관점으로 평가한다(§4.1 ③ — 상대 모델링도 동일 그리디 정책).
 * 실제 L1 프루닝 코드는 다음 태스크(MCTS 구현) 몫 — 여기서는 벤치 변형으로만 구현한다.
 *
 * topK 변형은 "확장 시 평가함수 상위 k 후보만 자식으로 전개"(§4.4 L1)의 근사다:
 * 값싼 simple 프로파일(1-ply, discard/chooseNoble 해소 없음)로 전 후보를 먼저 채점해
 * 상위 k만 남기고, 그 k개만 완전 적용(applyResolved) + full 평가로 최종 argmax를 낸다.
 * full evaluate(paranoid-lite, 상대 수만큼 배수 비용)를 상위 k에서만 지불하는 것이
 * 프루닝이 절약을 만드는 지점이다.
 */
function playout(root: GameState, depth: number, opts: PlayoutOptions = {}): void {
  let s = root
  for (let i = 0; i < depth; i++) {
    if (s.phase.kind === 'gameOver') return
    let actions = legalActions(s)

    if (opts.pruneTakeDifferent) {
      const takeDiff = actions.filter((a) => a.type === 'TAKE_DIFFERENT')
      const rest = actions.filter((a) => a.type !== 'TAKE_DIFFERENT')
      if (takeDiff.length > 1) {
        // 구매 거리 기여(파산 근접) 색 우선 근사: 조합 내 색 수 합이 큰 순으로 정렬 후 절반만 유지
        // (엄밀한 "구매 거리 기여 색 우선"은 mcts 구현 시 evaluate 연계로 정교화 — 벤치는 근사)
        const sorted = [...takeDiff].sort((a, b) => {
          const ca = a.type === 'TAKE_DIFFERENT' ? a.colors.length : 0
          const cb = b.type === 'TAKE_DIFFERENT' ? b.colors.length : 0
          return cb - ca
        })
        actions = [...rest, ...sorted.slice(0, Math.ceil(sorted.length / 2))]
      }
    }

    if (opts.topK !== undefined && actions.length > opts.topK) {
      // 값싼 1차 채점(simple 프로파일, 얕은 applyAction)으로 상위 k만 선별
      const withScore: { action: Action; score: number }[] = actions.map((a) => ({
        action: a,
        score: evaluate(applyAction(s, a).state, s.currentPlayer, 'simple'),
      }))
      withScore.sort((a, b) => b.score - a.score)
      actions = withScore.slice(0, opts.topK).map((x) => x.action)
    }

    // 2차: 선별된 후보만 완전 적용(applyResolved)해 full 평가로 최종 argmax
    let best = actions[0]!
    let bestScore = -Infinity
    for (const action of actions) {
      const after = applyResolved(s, action)
      const score = evaluate(after, s.currentPlayer, 'full')
      if (score > bestScore) {
        bestScore = score
        best = action
      }
    }
    s = applyResolved(s, best)
  }
}

function reportKo(lines: string[]): void {
  console.log(`\n${lines.join('\n')}\n`)
}

describe('성능 벤치마크 (docs/AI_DESIGN.md §4.4)', () => {
  it.runIf(RUN)(
    'apply/clone/determinize 단가 + sim/s 측정 + 에스컬레이션 판정',
    { timeout: 300_000 },
    () => {
      // 벤치는 탐색 핫패스 조건과 동일하게 freeze off로 측정 (L0 적용 상태 반영).
      // freeze on/off 비교 수치는 별도로 1회 더 측정해 보고한다.
      const positions = benchPositions()
      expect(positions.length).toBeGreaterThan(10)

      const rngSeed = createRng(0xc0ffee)

      // ---- 1) apply 단가 (freeze off) ----------------------------------
      setStateFreezing(false)
      const applySamples = positions.slice(0, 30)
      let applyOpCount = 0
      const applyTiming = timeIt(1, () => {
        for (const pos of applySamples) {
          if (pos.phase.kind === 'gameOver') continue
          for (const action of legalActions(pos)) {
            applyAction(pos, action)
            applyOpCount++
          }
        }
      })
      const applyUsPerOp = (applyTiming.totalMs * 1000) / applyOpCount

      // ---- 2) clone 단가 (구조 복사 — serialize/deserialize 왕복) --------
      const cloneSamples = positions.slice(0, 30)
      const cloneTiming = timeIt(200, () => {
        for (const pos of cloneSamples) {
          deserialize(serialize(pos))
        }
      })
      const cloneUsPerOp = (cloneTiming.totalMs * 1000) / (cloneTiming.count * cloneSamples.length)

      // ---- 3) determinize 단가 (요청당 1회 — sim/s에는 미포함) -----------
      let rng: RngState = rngSeed
      const detSamples = positions.slice(0, 30)
      const detTiming = timeIt(50, () => {
        for (const pos of detSamples) {
          const [, next] = determinize(pos, rng)
          rng = next
        }
      })
      const detUsPerOp = (detTiming.totalMs * 1000) / (detTiming.count * detSamples.length)

      // ---- 4) freeze on/off 비교 (참고 수치 1줄) -------------------------
      setStateFreezing(true)
      const freezeOnTiming = timeIt(1, () => {
        for (const pos of applySamples) {
          if (pos.phase.kind === 'gameOver') continue
          for (const action of legalActions(pos)) applyAction(pos, action)
        }
      })
      const freezeOnUsPerOp = (freezeOnTiming.totalMs * 1000) / applyOpCount
      setStateFreezing(false) // 이후 측정은 전부 freeze off (L0 적용 상태)

      // ---- 5) sim/s 기본 정의: 그리디 플레이아웃 깊이 10 -----------------
      const DEPTH = 10
      const simPositions = positions.slice(0, 40)
      let idx = 0
      const simTiming = timeIt(simPositions.length, () => {
        const pos = simPositions[idx % simPositions.length]!
        idx++
        playout(pos, DEPTH)
      })
      const simsPerSec = perSecFromUs(simTiming.usPerOp)

      // ---- 6) L1 변형들: 깊이 6 / 상위 k 후보 / TAKE_DIFFERENT 절반 프루닝 / 조합 --------
      const variantDepth6 = timeIt(simPositions.length, () => {
        const pos = simPositions[idx % simPositions.length]!
        idx++
        playout(pos, 6)
      })
      const simsPerSecDepth6 = perSecFromUs(variantDepth6.usPerOp)

      const TOP_K = 8
      const variantTopK = timeIt(simPositions.length, () => {
        const pos = simPositions[idx % simPositions.length]!
        idx++
        playout(pos, DEPTH, { topK: TOP_K })
      })
      const simsPerSecTopK = perSecFromUs(variantTopK.usPerOp)

      const variantPruneTD = timeIt(simPositions.length, () => {
        const pos = simPositions[idx % simPositions.length]!
        idx++
        playout(pos, DEPTH, { pruneTakeDifferent: true })
      })
      const simsPerSecPruneTD = perSecFromUs(variantPruneTD.usPerOp)

      const variantBoth = timeIt(simPositions.length, () => {
        const pos = simPositions[idx % simPositions.length]!
        idx++
        playout(pos, 6, { topK: TOP_K, pruneTakeDifferent: true })
      })
      const simsPerSecBoth = perSecFromUs(variantBoth.usPerOp)

      // ---- 판정 -----------------------------------------------------------
      const TARGET = 2000
      const FLOOR = 800
      const bestL1 = Math.max(
        simsPerSecDepth6,
        simsPerSecTopK,
        simsPerSecPruneTD,
        simsPerSecBoth,
      )
      const verdict =
        simsPerSec >= TARGET
          ? `목표(${TARGET}) 이상 달성 — L0만으로 충분`
          : simsPerSec >= FLOOR
            ? `하한(${FLOOR}) 이상, 목표(${TARGET}) 미달 — L0로 수용 가능(L1 불필요)`
            : bestL1 >= FLOOR
              ? `기본 정의는 하한 미달이나 L1 변형 중 최선(${bestL1.toFixed(0)} sim/s)이 하한 이상 — L1 채택 권고`
              : `기본 정의·L1 변형 전부 하한 미달(최선 ${bestL1.toFixed(0)} sim/s) — L2(3-ply max-n 알고리즘 교체) 검토 근거 확보. ` +
                `구현은 이 태스크 범위 밖(다음 태스크: MCTS 구현에서 L1 프루닝 적용 후 재측정)`

      reportKo([
        '=== 성능 벤치마크 결과 (docs/AI_DESIGN.md §4.4) ===',
        `표본 국면 수: ${positions.length}개 (시드 5개 × 그리디 자가 진행, 초/중/후반 혼합)`,
        '',
        `apply 단가:        ${applyUsPerOp.toFixed(2)} µs/회  (freeze off, n=${applyOpCount})`,
        `apply 단가(freeze on): ${freezeOnUsPerOp.toFixed(2)} µs/회 (참고 비교, n=${applyOpCount})`,
        `clone 단가:        ${cloneUsPerOp.toFixed(2)} µs/회  (serialize+deserialize 왕복, n=${cloneTiming.count * cloneSamples.length})`,
        `determinize 단가:  ${detUsPerOp.toFixed(2)} µs/회  (요청당 1회 — sim/s 미포함, n=${detTiming.count * detSamples.length})`,
        '',
        `sim/s (기본 정의, 깊이 10):              ${simsPerSec.toFixed(0)} sim/s`,
        `sim/s (L1 변형: 깊이 6):                  ${simsPerSecDepth6.toFixed(0)} sim/s`,
        `sim/s (L1 변형: 상위 ${TOP_K}후보):             ${simsPerSecTopK.toFixed(0)} sim/s`,
        `sim/s (L1 변형: TAKE_DIFFERENT 절반 프루닝): ${simsPerSecPruneTD.toFixed(0)} sim/s`,
        `sim/s (L1 변형: 깊이 6 + 상위 ${TOP_K} + 프루닝): ${simsPerSecBoth.toFixed(0)} sim/s`,
        '',
        `목표 ${TARGET} sim/s / 수용 하한 ${FLOOR} sim/s`,
        `판정: ${verdict}`,
      ])

      // 벤치는 측정 도구다 — 유일한 불변식은 "값이 유한한 양수"뿐 (CI 게이트 아님)
      expect(applyUsPerOp).toBeGreaterThan(0)
      expect(cloneUsPerOp).toBeGreaterThan(0)
      expect(detUsPerOp).toBeGreaterThan(0)
      expect(simsPerSec).toBeGreaterThan(0)
    },
  )

  it.runIf(!RUN)('벤치는 BENCH=1로 로컬 실행 (CI 비차단)', () => {
    expect(true).toBe(true)
  })
})
