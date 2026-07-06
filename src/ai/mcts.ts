// 어려움: anytime MCTS (docs/AI_DESIGN.md §4)
// determinize 1회 → 하드가드 → 트리 탐색. 트리 하강은 applyResolvedWith(phase 붕괴),
// 플레이아웃은 그리디(evaluate full 1-ply) truncate, 백업은 max-n(플레이어별 가치 벡터).
// anytime: 언제 끊겨도 루트 1-ply 순위가 폴백으로 존재한다.

import {
  CARDS,
  GEM_COLORS,
  TOKEN_COLORS,
  applyAction,
  isLegal,
  legalActions,
  paymentNeed,
  type Action,
  type GameState,
  type GemColor,
  type RngState,
  type TokenMap,
} from '../engine'
import { evaluate, evaluateAllFull } from './evaluate'
import { hardGuard } from './guards'
import { compositeMoves, determinize } from './moveGen'
import { discardPolicy, noblePolicy } from './policies'
import { applyResolvedWith, type ResolvedMove } from './search'

// 시간 체크 간격. 설계 원안은 128회(§4.1)였으나 M6 실측에서 시뮬레이션 단가가
// ~1ms라 128 간격은 예산 60~150ms 대비 2~5배 오버슈트를 냈다. performance.now()
// 단가(수십 ns)는 sim 단가 대비 무시 가능하므로 16 간격으로 하향 — 예산 준수(§1)
// 최악 오버슈트를 16×sim단가(≈30ms)로 줄인다.
const TIME_CHECK_MASK = 15

/**
 * 튜닝 상수 — bench/selfplay가 실험을 위해 조정할 수 있는 단일 지점.
 * 프로덕션 기본값은 bench(scripts/bench.ts) 판정으로 확정하고 커밋 메시지에 기록한다.
 * - ucbC: 탐험 상수. 0.1~0.3에서 하향 탐색 (§4.1)
 * - playoutDepth: 플레이아웃 truncate 깊이. L0=10, L1=6 (§4.4)
 * - prunePlayoutTakes: L1 — 플레이아웃의 TAKE_DIFFERENT를 "구매 거리 기여 색 포함"
 *   조합만 남긴다 (§4.4). 트리 자체(루트·내부 노드)는 전수 열거를 유지한다.
 * - valueScale: max-n 백업의 마진 → (0,1) 시그모이드 스케일
 */
export const MCTS_TUNING = {
  ucbC: 0.2,
  playoutDepth: 6,
  prunePlayoutTakes: true,
  valueScale: 250,
}

export interface HardStats {
  iters: number
  elapsedMs: number
}

interface TreeNode {
  readonly state: GameState
  readonly moves: readonly ResolvedMove[]
  readonly children: (TreeNode | null)[]
  readonly valueSum: number[] // 플레이어별 누적 가치 (max-n)
  visits: number
  expandNext: number
}

function makeNode(state: GameState, moves: readonly ResolvedMove[], n: number): TreeNode {
  return {
    state,
    moves,
    children: new Array<TreeNode | null>(moves.length).fill(null),
    valueSum: new Array<number>(n).fill(0),
    visits: 0,
    expandNext: 0,
  }
}

function playMoves(state: GameState): ResolvedMove[] {
  return legalActions(state).map((action) => ({ action }))
}

/**
 * 현재 플레이어의 최근접 목표 카드(가치/(1+거리) 최대)의 부족 색 집합.
 * 부족이 없으면(즉시 구매 가능) null — 프루닝하지 않는다.
 */
function neededColors(state: GameState, me: number): ReadonlySet<GemColor> | null {
  const p = state.players[me]!
  let best: ReadonlySet<GemColor> | null = null
  let bestValue = -Infinity
  const consider = (cardId: number): void => {
    const card = CARDS[cardId]!
    const need = paymentNeed(p, card)
    let dist = 0
    const short = new Set<GemColor>()
    for (const g of GEM_COLORS) {
      const shortage = need[g] - p.tokens[g]
      if (shortage > 0) {
        dist += shortage
        short.add(g)
      }
    }
    dist = Math.max(0, dist - p.tokens.gold)
    const value = (8 + card.points * 10) / (1 + dist)
    if (value > bestValue) {
      bestValue = value
      best = short.size > 0 ? short : null
    }
  }
  for (const row of state.board) {
    for (const id of row) {
      if (id !== null && id >= 0) consider(id)
    }
  }
  for (const r of p.reserved) {
    if (r.cardId >= 0) consider(r.cardId)
  }
  return best
}

/** 플레이아웃 후보 — L1 프루닝: 목표와 무관한 TAKE_DIFFERENT 조합을 잘라낸다 (§4.4) */
function playoutActions(state: GameState): readonly Action[] {
  const legal = legalActions(state)
  if (!MCTS_TUNING.prunePlayoutTakes) return legal
  const needed = neededColors(state, state.currentPlayer)
  if (needed === null) return legal
  const kept = legal.filter(
    (a) => a.type !== 'TAKE_DIFFERENT' || a.colors.some((c) => needed.has(c)),
  )
  return kept.length > 0 ? kept : legal
}

/** 그리디 플레이아웃: evaluate full 1-ply argmax, truncate (§4.1 ③) */
function playout(start: GameState): GameState {
  let s = start
  for (let d = 0; d < MCTS_TUNING.playoutDepth; d++) {
    if (s.phase.kind === 'gameOver') break
    const me = s.currentPlayer
    let best: GameState | null = null
    let bestScore = -Infinity
    for (const action of playoutActions(s)) {
      const after = applyResolvedWith(s, { action })
      const score = evaluate(after, me, 'full')
      if (score > bestScore) {
        bestScore = score
        best = after
      }
    }
    if (!best) break
    s = best
  }
  return s
}

/** max-n 리프 가치: 플레이어별 마진을 시그모이드로 (0,1) 정규화. 승패는 1/0으로 포화 */
function leafValues(state: GameState, n: number): number[] {
  const margins = evaluateAllFull(state)
  const out = new Array<number>(n)
  for (let p = 0; p < n; p++) {
    out[p] = 1 / (1 + Math.exp(-margins[p]! / MCTS_TUNING.valueScale))
  }
  return out
}

/**
 * anytime MCTS (§4.1). view는 playerView 마스킹본 — 내부에서 determinize 1회.
 * 반환 ResolvedMove의 forcedDiscard는 composite 승리 시에만 존재한다.
 * limits.maxIters는 테스트/벤치 전용(결정론 고정).
 */
export function mctsChoose(
  view: GameState,
  me: number,
  budgetMs: number,
  rng: RngState,
  limits?: { maxIters?: number },
): [ResolvedMove, RngState, HardStats] {
  const started = performance.now()
  const deadline = started + budgetMs
  const [rootState, rng2] = determinize(view, rng)
  const n = rootState.players.length

  // 하드가드 (§3) — 즉승/명백수는 탐색 없이 확정
  const guard = hardGuard(rootState, me)
  if (guard) {
    return [{ action: guard }, rng2, { iters: 0, elapsedMs: performance.now() - started }]
  }

  const legal = legalActions(rootState)
  if (legal.length === 1) {
    return [{ action: legal[0]! }, rng2, { iters: 0, elapsedMs: performance.now() - started }]
  }

  // 루트 후보: 전수 열거 + composite 스왑 패턴 (§4.3). 1-ply 평가로 정렬해
  // 확장 순서와 anytime 폴백(0회 시뮬레이션에도 최선수 존재)을 동시에 얻는다.
  const rootMoves = [...legal.map((action) => ({ action }) as ResolvedMove), ...compositeMoves(rootState, legal)]
  const ordered = rootMoves
    .map((move) => {
      const state = applyResolvedWith(rootState, move)
      return { move, state, score: evaluate(state, me, 'full') }
    })
    .sort((a, b) => b.score - a.score)

  const root = makeNode(
    rootState,
    ordered.map((o) => o.move),
    n,
  )
  // 정렬 중 계산한 자식 상태 재사용 — 루트 확장 비용 0
  for (const [i, o] of ordered.entries()) {
    root.children[i] = makeNode(o.state, o.state.phase.kind === 'gameOver' ? [] : playMoves(o.state), n)
  }

  const maxIters = limits?.maxIters ?? Number.POSITIVE_INFINITY
  let iters = 0
  const path: TreeNode[] = []
  while (iters < maxIters) {
    if ((iters & TIME_CHECK_MASK) === 0 && performance.now() >= deadline) break

    // ② 선택/확장 — 미확장 자식 우선(생성 순서), 소진 시 UCB 하강
    path.length = 0
    let node = root
    path.push(node)
    while (node.state.phase.kind !== 'gameOver') {
      if (node.expandNext < node.moves.length) {
        const i = node.expandNext++
        let child = node.children[i]
        if (!child) {
          const childState = applyResolvedWith(node.state, node.moves[i]!)
          child = makeNode(
            childState,
            childState.phase.kind === 'gameOver' ? [] : playMoves(childState),
            n,
          )
          node.children[i] = child
        }
        path.push(child)
        node = child
        break
      }
      const player = node.state.currentPlayer
      const logN = Math.log(node.visits)
      let bestI = 0
      let bestU = -Infinity
      for (let i = 0; i < node.children.length; i++) {
        const c = node.children[i]!
        const u =
          c.valueSum[player]! / c.visits + MCTS_TUNING.ucbC * Math.sqrt(logN / c.visits)
        if (u > bestU) {
          bestU = u
          bestI = i
        }
      }
      node = node.children[bestI]!
      path.push(node)
    }

    // ③ 플레이아웃 → ④ max-n 백업
    const end = node.state.phase.kind === 'gameOver' ? node.state : playout(node.state)
    const values = leafValues(end, n)
    for (const nd of path) {
      nd.visits++
      for (let p = 0; p < n; p++) nd.valueSum[p]! += values[p]!
    }
    iters++
  }

  // anytime: 최다 방문 (동률 → 평균 가치 → 1-ply 순위). 0회면 1-ply 최선수
  let bestI = 0
  let bestVisits = -1
  let bestMean = -Infinity
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!
    if (c.visits === 0) continue
    const mean = c.valueSum[me]! / c.visits
    if (c.visits > bestVisits || (c.visits === bestVisits && mean > bestMean)) {
      bestVisits = c.visits
      bestMean = mean
      bestI = i
    }
  }
  return [root.moves[bestI]!, rng2, { iters, elapsedMs: performance.now() - started }]
}

export interface HardAgent {
  /** view = playerView 결과. 전 phase에서 legalActions(view)의 원소를 반환한다 (§1 계약) */
  chooseAction(
    view: GameState,
    me: number,
    budgetMs: number,
    rng: RngState,
    limits?: { maxIters?: number },
  ): [Action, RngState, HardStats]
}

export interface PlanMemo {
  /** play 착수 직후 호출 — composite면 take 직후 기대 국면(토큰·mustDiscard)과 함께 기억, 아니면 소거 */
  remember(view: GameState, me: number, move: ResolvedMove): void
  /** discard phase에서 호출 — 전제 국면이 정확히 일치할 때만 계획을 반환. 항상 소거 */
  consume(view: GameState, me: number): Action | null
  clear(): void
}

/**
 * composite 반납 계획 메모 (§4.3). isLegal만으로는 "다른 take를 전제로 세운
 * 계획이 우연히 합법"인 경우(예: 타임아웃 폴백으로 다른 take가 실전 적용)를
 * 걸러내지 못하므로, take 직후의 기대 토큰 보유량과 mustDiscard를 함께 기억해
 * discard 시점의 실제 국면과 대조한다 — 불일치면 정책으로 복귀.
 * 토큰 보유량은 마스킹 불변이라 뷰 기준 대조가 정확하다.
 */
export function createPlanMemo(): PlanMemo {
  let planned: {
    me: number
    discard: Action
    expectTokens: TokenMap
    expectMustDiscard: number
  } | null = null

  return {
    remember(view, me, move) {
      planned = null
      if (!move.forcedDiscard || view.phase.kind !== 'play') return
      // TAKE는 카드 연산이 없어 마스킹 뷰에도 안전하게 적용된다 (덱 접근 없음)
      const mid = applyAction(view, move.action).state
      if (mid.phase.kind !== 'discard') return
      planned = {
        me,
        discard: move.forcedDiscard,
        expectTokens: mid.players[me]!.tokens,
        expectMustDiscard: mid.phase.mustDiscard,
      }
    },
    consume(view, me) {
      const plan = planned
      planned = null
      if (!plan || plan.me !== me || view.phase.kind !== 'discard') return null
      if (view.phase.mustDiscard !== plan.expectMustDiscard) return null
      const mine = view.players[me]!.tokens
      for (const c of TOKEN_COLORS) {
        if (mine[c] !== plan.expectTokens[c]) return null
      }
      return isLegal(view, plan.discard) ? plan.discard : null
    },
    clear() {
      planned = null
    },
  }
}

/**
 * 어려움 에이전트 — discard/chooseNoble은 정책 즉답(policy-consistency 계약 §4.3),
 * play는 MCTS. composite 승리 시 계획된 반납을 PlanMemo로 기억해 직후 discard
 * phase에서 실행한다(전제 국면 일치 시에만 — 어긋나면 정책으로 복귀).
 * 계획 기억은 에이전트 인스턴스 지역 상태다 — Worker당 1개, 게임 간 공유 없음.
 */
export function createHardAgent(): HardAgent {
  const memo = createPlanMemo()

  return {
    chooseAction(view, me, budgetMs, rng, limits) {
      const zero: HardStats = { iters: 0, elapsedMs: 0 }
      if (view.phase.kind === 'discard') {
        const planned = memo.consume(view, me)
        return [planned ?? discardPolicy(view, me), rng, zero]
      }
      memo.clear()
      if (view.phase.kind === 'chooseNoble') {
        return [noblePolicy(view, me), rng, zero]
      }

      const [move, rng2, stats] = mctsChoose(view, me, budgetMs, rng, limits)
      memo.remember(view, me, move)
      return [move.action, rng2, stats]
    },
  }
}
