// 어려움 — anytime MCTS (docs/AI_DESIGN.md §4)
// determinize 1회(§4.2) → UCT 선택/확장(트리 하강은 applyResolved, play 액션만 엣지 §4.3)
// → 그리디 플레이아웃 truncate → 플레이어별 평가 max-n 백업 → 최다 방문 수 반환.
// 벽시계 예산은 32회 간격으로만 검사한다(TIME_CHECK_MASK 주석 — §4.1의 128에서
// 실측 후 하향). 언제 끊겨도 최선수 보유.
//
// 무작위성은 determinize의 시드 RNG뿐이다. 플레이아웃은 결정적 그리디(§4.1 ③),
// UCB/최다 방문 동률은 앞 인덱스 우선 — 같은 (view, seed, iteration 수)면 같은 수.
//
// L1 프루닝 (M6-1 벤치 d67d1c6 근거 — 기본 정의 88 sim/s는 하한 800에 크게 미달,
// 병목은 evaluate('full')의 다인 순회(~17µs, simple의 6.6배)라 호출 수 자체를 줄인다):
//   · 플레이아웃 깊이 10→6            (벤치 단독 107~157 sim/s)
//   · 상위 8후보 전개 — 값싼 simple 1-ply 선별 후 full 재평가 (벤치 단독 191~212 sim/s)
//   · TAKE_DIFFERENT 절반 프루닝 — 색 수 많은 조합 우선     (벤치 단독 102~131 sim/s)
//   · 셋 조합                          (벤치 347~402 sim/s — 적용 가능한 최선)
// 셋을 조합해도 하한 미달이지만 L2(3-ply max-n 교체)는 이 태스크 범위 밖 —
// M6-3 승률 검증에서 미달일 때의 비상 수단으로 남긴다.

import { applyAction, legalActions, type Action, type GameState, type RngState } from '../engine'
import { evaluate, type EvalProfile } from './evaluate'
import { hardGuard } from './guards'
import { determinize } from './moveGen'
import { discardPolicy, noblePolicy } from './policies'
import { applyResolved } from './search'

/**
 * UCB 탐험 상수 — §4.1: 0.1~0.3 범위에서 시작해 자가대전으로 하향 탐색(선행 연구에서
 * 0 근처가 최적). M6-3 하향 탐색 결과(어려움>보통 50판, 400ms, 시드 11000+):
 * 0.2 → 68% / 0.1 → 60% — 저반복 구간(수백 iteration)에서는 루트 후보가 이미
 * 1-ply full 평가로 정렬돼 있어 탐험을 더 줄이면 선별 1위에 방문이 쏠려 사실상
 * 1-ply 그리디로 퇴화한다. 0.2 유지 (docs/AI_DESIGN.md §6.1 M6 기록).
 */
export const UCB_C = 0.2

/** 플레이아웃 truncate 깊이 — 벤치: 10→6 축소로 88→107~157 sim/s (§4.4 L1) */
const PLAYOUT_DEPTH = 6

/** 전개/플레이아웃 상위 k 후보 — 벤치: k=8 simple 선별로 191~212 sim/s (§4.4 L1) */
const TOP_K = 8

/**
 * 시간 체크 간격 마스크 — 32회마다 performance.now() 검사.
 * §4.1의 128은 목표 2,000 sim/s(0.5ms/iter) 가정의 파라미터다. 실측 단가는
 * ~2.6ms/iter(M6-1 벤치 조합 347~402 sim/s, 실코드 384 iter/1000ms)라 128 배치는
 * 단독 실행 ~333ms·부하 시 ~0.8s 무중단이 되어, budget 1000ms + 배치 오버런이
 * DoD("1초 예산 내 착수")와 client.ts 하드 타임아웃(1500ms)을 위협한다 — 초과 시
 * 폴백이 쉬움 1-ply로 수를 확정하고 진짜 MCTS 응답은 폐기된다(조용한 강등).
 * 32로 하향하면 무중단 배치 ~83ms(4배 축소). performance.now() 호출 비용(~0.1µs)은
 * 단가 대비 무시 수준이라 처리량 손실은 없다.
 */
const TIME_CHECK_MASK = 31

/**
 * 평가값 → [0,1] 정규화 스케일 (시그모이드 1/(1+e^(-v/50))).
 * evaluate('full')는 paranoid-lite 상대값이고 전형적 격차 크기가 SOFTMAX_SCALE=25
 * (greedy.ts)이므로 그 2배를 스케일로 잡아 전형 격차(±25)가 시그모이드의 민감 구간
 * (σ(±0.5)≈0.38~0.62)에 놓이게 한다. 승패 확정(±WEIGHTS.win)은 자연히 0/1로 포화 —
 * UCB exploitation 항이 탐험 항(UCB_C·√(ln N / n))과 같은 스케일에 있게 된다.
 */
const VALUE_SCALE = 50

export interface MctsOptions {
  /**
   * 테스트 전용: 벽시계 대신 고정 iteration 수로 종료 상한을 건다.
   * 벽시계 기반은 같은 입력이라도 iteration 수가 달라질 수 있어 결정론 어서션과
   * fuzz 시간 상한에 이 옵션을 쓴다 (예산과 둘 중 먼저 닿는 쪽에서 멈춘다).
   */
  readonly maxIters?: number
}

interface Node {
  readonly state: GameState
  /** 이 노드에서 둘 차례의 플레이어 — max-n: 선택 시 이 관점을 최대화한다 */
  readonly player: number
  /**
   * 전개 후보 (L1 프루닝 적용) — 터미널이면 빈 배열.
   * 루트는 항상, 내부 노드는 TOP_K 초과 시 선별 점수 내림차순 (pruneActions 주석)
   */
  readonly actions: readonly Action[]
  /** actions와 짝 — null이면 미전개. 전개 순서 = actions 순(무브 오더링) */
  readonly children: (Node | null)[]
  visits: number
  /** 플레이어별 누적 정규화 가치 (max-n 백업, §4.1 ④) */
  readonly valueSum: number[]
}

/**
 * L1 프루닝 후보 목록 (선별 점수 내림차순).
 * ① TAKE_DIFFERENT 절반 프루닝: 색 수 많은 조합 우선(많이 집을수록 구매 거리 기여
 *    가능성이 높다) — 가치 순서는 바로 아래 ②의 평가 선별이 재정렬하므로 여기서는
 *    후보 수 절감이 목적이다. 벤치(d67d1c6)와 동일한 휴리스틱.
 * ② 상위 k 선별: 1-ply(얕은 applyAction) 평가 상위 TOP_K만 남긴다. 내부 노드/
 *    플레이아웃은 값싼 simple 프로파일(벤치와 동일), 루트만 full 프로파일 —
 *    반환 수는 루트 후보 중 하나뿐이라 루트 선별 품질이 수 품질의 상한인데,
 *    simple은 귀족·예약·상대를 보지 못한다. 루트는 요청당 1회라 비용이 무시된다.
 *
 * alwaysSort(루트 전용): 후보가 TOP_K 이하라도 항상 평가 정렬한다 — 0~저반복으로
 * 끊겨도 bestByVisits의 앞 인덱스 퇴화가 "루트 1-ply 최선수"가 되게(anytime 바닥).
 * 내부 노드/플레이아웃 핫패스는 벤치 구성 그대로 TOP_K 초과일 때만 평가한다.
 */
function pruneActions(
  state: GameState,
  profile: EvalProfile,
  alwaysSort = false,
): readonly Action[] {
  let actions = legalActions(state)

  const takeDiff = actions.filter((a) => a.type === 'TAKE_DIFFERENT')
  if (takeDiff.length > 1) {
    const rest = actions.filter((a) => a.type !== 'TAKE_DIFFERENT')
    const sorted = [...takeDiff].sort((a, b) => {
      const ca = a.type === 'TAKE_DIFFERENT' ? a.colors.length : 0
      const cb = b.type === 'TAKE_DIFFERENT' ? b.colors.length : 0
      return cb - ca
    })
    actions = [...rest, ...sorted.slice(0, Math.ceil(sorted.length / 2))]
  }

  if (alwaysSort || actions.length > TOP_K) {
    const me = state.currentPlayer
    const scored = actions.map((action) => ({
      action,
      score: evaluate(applyAction(state, action).state, me, profile),
    }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, TOP_K).map((x) => x.action)
  }
  return actions
}

function makeNode(
  state: GameState,
  playerCount: number,
  profile: EvalProfile,
  alwaysSort = false,
): Node {
  const actions = state.phase.kind === 'gameOver' ? [] : pruneActions(state, profile, alwaysSort)
  return {
    state,
    player: state.currentPlayer,
    actions,
    children: actions.map(() => null),
    visits: 0,
    valueSum: new Array<number>(playerCount).fill(0),
  }
}

/** 전부 전개된 자식 중 UCB 최대 인덱스 — 동률은 앞 인덱스(결정론) */
function selectChild(node: Node): number {
  const logN = Math.log(node.visits)
  let bestIdx = 0
  let bestScore = -Infinity
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    const score =
      child.valueSum[node.player]! / child.visits + UCB_C * Math.sqrt(logN / child.visits)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}

/** 그리디 플레이아웃 (§4.1 ③): L1 프루닝 후보를 full 평가 argmax로 진행, 깊이 truncate */
function playout(from: GameState): GameState {
  let s = from
  for (let step = 0; step < PLAYOUT_DEPTH; step++) {
    if (s.phase.kind === 'gameOver') return s
    const me = s.currentPlayer
    let best: GameState | null = null
    let bestScore = -Infinity
    for (const action of pruneActions(s, 'simple')) {
      const after = applyResolved(s, action)
      const score = evaluate(after, me, 'full')
      if (score > bestScore) {
        bestScore = score
        best = after
      }
    }
    s = best! // play phase의 legalActions는 공집합이 아니다(PASS 보장) — best 항상 존재
  }
  return s
}

/** 플레이아웃 끝 상태의 플레이어 p 관점 정규화 가치 (max-n 백업의 성분) */
function normValue(state: GameState, p: number): number {
  return 1 / (1 + Math.exp(-evaluate(state, p, 'full') / VALUE_SCALE))
}

/** 선택 → 확장(1노드) → 플레이아웃 → max-n 백업 1회 */
function runIteration(root: Node, playerCount: number): void {
  // ② 선택/확장: 트리 하강은 미전개 자식을 만날 때까지 UCB — 하강 엣지는 전부
  // applyResolved 결과라 play 액션만 엣지가 된다(§4.3)
  const path: Node[] = [root]
  let node = root
  while (node.actions.length > 0) {
    const untried = node.children.indexOf(null)
    if (untried >= 0) {
      const child = makeNode(
        applyResolved(node.state, node.actions[untried]!),
        playerCount,
        'simple',
      )
      node.children[untried] = child
      path.push(child)
      node = child
      break // 확장은 iteration당 1노드
    }
    node = node.children[selectChild(node)]!
    path.push(node)
  }

  // ③ 플레이아웃 (터미널 노드는 그 상태 그대로 평가)
  const end = node.state.phase.kind === 'gameOver' ? node.state : playout(node.state)

  // ④ 백업: 플레이어별 가치를 경로 전체에 누적 (max-n — minimax 분기 없음)
  for (let p = 0; p < playerCount; p++) {
    const v = normValue(end, p)
    for (const n of path) n.valueSum[p]! += v
  }
  for (const n of path) n.visits++
}

/**
 * anytime MCTS 착수 선택 (§4.1). 반환: [수, determinize 후 RNG, 수행한 iteration 수].
 * iteration 수는 AiResponse.stats.iters 보고용(§5.2).
 * discard/chooseNoble phase는 chooseActionSync와 동일하게 정책 즉답(policy-consistency §4.3),
 * 탐색 전 hardGuard — 즉승 수가 있으면 무조건 그 수(§3).
 */
export function mctsChoose(
  view: GameState,
  me: number,
  budgetMs: number,
  rng: RngState,
  opts: MctsOptions = {},
): [Action, RngState, number] {
  if (view.phase.kind === 'discard') return [discardPolicy(view, me), rng, 0]
  if (view.phase.kind === 'chooseNoble') return [noblePolicy(view, me), rng, 0]

  // ① determinize 1회 (§4.2) — HIDDEN_CARD 유입으로 인한 마스킹 열화 방지
  const [rootState, rng2] = determinize(view, rng)

  const guard = hardGuard(rootState, me)
  if (guard) return [guard, rng2, 0]

  const playerCount = view.players.length
  // 루트만 full 선별 + 항상 정렬 (pruneActions 주석 — 수 품질 상한과 anytime 바닥)
  const root = makeNode(rootState, playerCount, 'full', true)
  if (root.actions.length === 1) return [root.actions[0]!, rng2, 0]

  const deadline = performance.now() + budgetMs
  const maxIters = opts.maxIters ?? Number.POSITIVE_INFINITY
  let iters = 0
  while (iters < maxIters) {
    if ((iters & TIME_CHECK_MASK) === 0 && performance.now() >= deadline) break
    runIteration(root, playerCount)
    iters++
  }

  // anytime: 최다 방문 자식(§4.1 bestByVisits). 동률·0 iteration이면 앞 인덱스 —
  // 루트 후보는 항상 선별 점수 내림차순이라 "루트 1-ply 최선수"로 퇴화한다.
  let bestIdx = 0
  let bestVisits = root.children[0]?.visits ?? 0
  for (let i = 1; i < root.children.length; i++) {
    const visits = root.children[i]?.visits ?? 0
    if (visits > bestVisits) {
      bestVisits = visits
      bestIdx = i
    }
  }
  return [root.actions[bestIdx]!, rng2, iters]
}
