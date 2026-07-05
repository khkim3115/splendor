// Zustand 단일 스토어 (docs/ARCHITECTURE.md §4)
// actionLog가 단일 진실원 — committed/snapshots는 파생 캐시.
// UI 전용 임시 상태(pendingPicks 등)는 엔진 상태와 절대 혼합하지 않는다.
// 다음 차례가 AI면 aiClient로 라우팅한다 (사람↔AI 전환에는 핸드오프 없음).

import { create } from 'zustand'
import { aiClient } from '../ai/client'
import {
  applyAction,
  legalActions,
  setupGame,
  validateAction,
  type Action,
  type CardId,
  type GameConfig,
  type GameEvent,
  type GameState,
  type GemColor,
} from '../engine'
import { clearSave, loadGame, saveGame } from './persistence'

export interface GameStore {
  // ── 엔진 상태 (진실원: actionLog) ──
  committed: GameState | null
  actionLog: Action[]
  snapshots: GameState[] // actionLog.length + 1개 — undo O(1)
  eventFeed: GameEvent[]
  eventCounts: number[] // 액션별 이벤트 수 — undo 시 eventFeed 절단용

  // ── UI 전용 임시 상태 ──
  lastEvents: GameEvent[] // 직전 액션의 이벤트 묶음 — Announcer 낭독용
  pendingPicks: GemColor[] // 토큰 집기 조립 중 (같은 색 2개 = [c, c])
  selectedCard: CardId | null
  selectedDeck: 1 | 2 | 3 | null
  handoffPending: boolean // 핫시트 기기 전달 대기 (사람 2명 이상일 때만)
  aiThinking: boolean
  aiSeq: number // AI 요청 세대 — stale 응답이 남의 aiThinking을 끄지 못하게 한다
  lastError: string | null

  // ── 명령 ──
  newGame: (config: GameConfig) => void
  loadSaved: () => string | null // 실패 사유 반환 (성공 시 null)
  dispatch: (action: Action) => void
  togglePick: (color: GemColor) => void
  clearSelection: () => void
  selectCard: (id: CardId | null) => void
  selectDeck: (tier: 1 | 2 | 3 | null) => void
  acknowledgeHandoff: () => void
  dismissError: () => void
  undo: () => void // vs AI(사람 1명) 전용 — 내 직전 결정 시점까지 롤백
  abandonGame: () => void
  maybeRunAi: () => void
}

const UI_RESET = {
  lastEvents: [] as GameEvent[],
  pendingPicks: [] as GemColor[],
  selectedCard: null,
  selectedDeck: null,
  handoffPending: false,
  aiThinking: false,
  lastError: null,
} as const

function humanCount(state: GameState): number {
  return state.config.players.filter((p) => p.type === 'human').length
}

function isHumanTurn(state: GameState): boolean {
  return state.config.players[state.currentPlayer]?.type === 'human'
}

/** softmax/determinize 전용 시드 — 게임 시드를 오염시키지 않는다 */
function aiSeedFor(state: GameState, turnIndex: number): number {
  return (state.config.seed ^ Math.imul(turnIndex + 1, 0x9e3779b9)) >>> 0
}

export const useGameStore = create<GameStore>((set, get) => ({
  committed: null,
  actionLog: [],
  snapshots: [],
  eventFeed: [],
  eventCounts: [],
  aiSeq: 0,
  ...UI_RESET,

  newGame: (config) => {
    const initial = setupGame(config)
    // 액션 0개짜리 세이브를 즉시 기록 — 첫 수 전 새로고침에도 게임이 유실되지 않는다
    saveGame(initial.config, [], initial)
    aiClient.cancelAll()
    set({
      committed: initial,
      actionLog: [],
      snapshots: [initial],
      eventFeed: [],
      eventCounts: [],
      ...UI_RESET,
    })
    get().maybeRunAi()
  },

  loadSaved: () => {
    const result = loadGame()
    if (!result.ok) return result.reason
    // 스냅샷·이벤트 재구성 (구조적 공유라 저렴)
    let s = setupGame(result.state.config)
    const snapshots: GameState[] = [s]
    const eventFeed: GameEvent[] = []
    const eventCounts: number[] = []
    for (const action of result.actions) {
      const outcome = applyAction(s, action)
      s = outcome.state
      snapshots.push(s)
      eventFeed.push(...outcome.events)
      eventCounts.push(outcome.events.length)
    }
    aiClient.cancelAll()
    set({
      committed: s,
      actionLog: [...result.actions],
      snapshots,
      eventFeed,
      eventCounts,
      ...UI_RESET,
      // 로드 직후에는 누가 기기를 들고 있는지 알 수 없다 — 사람이 2명 이상이면
      // 항상 핸드오프 게이트를 세워 비공개 정보 노출을 막는다 (§9-O)
      handoffPending: s.phase.kind !== 'gameOver' && humanCount(s) >= 2,
    })
    get().maybeRunAi()
    return null
  },

  dispatch: (action) => {
    const { committed, actionLog, snapshots, eventFeed, eventCounts } = get()
    if (!committed) return
    const v = validateAction(committed, action)
    if (!v.ok) {
      set({ lastError: `${v.messageKo} (${v.rule})` })
      return
    }
    const { state, events } = applyAction(committed, action)
    const log = [...actionLog, action]
    // 사람↔사람 턴 전환 시에만 기기 전달 오버레이 (AI 상대에는 불필요)
    const turnEnded = events.some((e) => e.t === 'turnEnded')
    const needHandoff =
      turnEnded && state.phase.kind !== 'gameOver' && isHumanTurn(state) && humanCount(state) >= 2
    set({
      committed: state,
      actionLog: log,
      snapshots: [...snapshots, state],
      eventFeed: [...eventFeed, ...events],
      eventCounts: [...eventCounts, events.length],
      ...UI_RESET,
      lastEvents: [...events], // Announcer 낭독용 — UI_RESET 뒤에 와야 한다
      handoffPending: needHandoff,
    })
    saveGame(state.config, log, state)
    get().maybeRunAi()
  },

  maybeRunAi: () => {
    const { committed, handoffPending, aiThinking, actionLog, aiSeq } = get()
    if (!committed || handoffPending || aiThinking) return
    if (committed.phase.kind === 'gameOver') return
    const kind = committed.config.players[committed.currentPlayer]
    if (!kind || kind.type !== 'ai') return

    const token = actionLog.length
    const seq = aiSeq + 1
    set({ aiThinking: true, aiSeq: seq })
    void aiClient
      .requestMove(committed, committed.currentPlayer, kind.difficulty, aiSeedFor(committed, token))
      .then((action) => {
        const now = get()
        // 내 세대가 아니면(undo 후 재발사 등) 남의 aiThinking을 건드리지 않고 폐기
        if (now.aiSeq !== seq) return
        if (now.committed !== committed || now.actionLog.length !== token) {
          set({ aiThinking: false })
          return
        }
        set({ aiThinking: false })
        now.dispatch(action)
      })
      .catch(() => {
        if (get().aiSeq === seq) set({ aiThinking: false })
      })
  },

  togglePick: (color) => {
    const { committed, pendingPicks } = get()
    if (!committed || committed.phase.kind !== 'play' || !isHumanTurn(committed)) return
    const already = pendingPicks.filter((c) => c === color).length

    // 재클릭 = 되돌려놓기 (커밋 전 무료 취소 — UI 상태 조작이지 룰 판정이 아님)
    if (already >= 1 && !(already === 1 && pendingPicks.length === 1)) {
      set({ pendingPicks: pendingPicks.filter((c) => c !== color), lastError: null })
      return
    }

    // 후보 조립 — 같은 색 두 번째 클릭은 같은 색 2개 의도 (§4.2)
    const next =
      already === 1 && pendingPicks.length === 1 ? [color, color] : [...pendingPicks, color]

    // 룰 판정은 엔진으로만 — 룰의 두 번째 표현을 만들지 않는다 (ARCHITECTURE §4-3)
    if (next.length === 2 && next[0] === next[1]) {
      const v = validateAction(committed, { type: 'TAKE_SAME', color })
      if (!v.ok) {
        set({ lastError: `${v.messageKo} (${v.rule})` })
        return
      }
    } else {
      // 부분 선택은 어떤 합법 TAKE_DIFFERENT로도 확장할 수 없으면 거절한다
      // (다중집합 포함 검사 — 중복 색이 섞이면 어떤 조합에도 포함될 수 없다)
      const count = (xs: readonly GemColor[], c: GemColor) => xs.filter((x) => x === c).length
      const feasible = legalActions(committed).some(
        (a) =>
          a.type === 'TAKE_DIFFERENT' && next.every((c) => count(a.colors, c) >= count(next, c)),
      )
      if (!feasible) {
        const v = validateAction(committed, { type: 'TAKE_DIFFERENT', colors: next })
        set({
          lastError: v.ok
            ? '이 조합으로는 가능한 행동이 없습니다 (§4)'
            : `${v.messageKo} (${v.rule})`,
        })
        return
      }
    }
    set({ pendingPicks: next, selectedCard: null, selectedDeck: null, lastError: null })
  },

  clearSelection: () =>
    set({ pendingPicks: [], selectedCard: null, selectedDeck: null, lastError: null }),

  selectCard: (id) => {
    const { committed } = get()
    if (!committed || !isHumanTurn(committed)) return
    set({ selectedCard: id, selectedDeck: null, pendingPicks: [], lastError: null })
  },

  selectDeck: (tier) => {
    const { committed } = get()
    if (!committed || !isHumanTurn(committed)) return
    set({ selectedDeck: tier, selectedCard: null, pendingPicks: [], lastError: null })
  },

  acknowledgeHandoff: () => {
    set({ handoffPending: false })
    get().maybeRunAi()
  },

  dismissError: () => set({ lastError: null }),

  undo: () => {
    const { committed, snapshots, actionLog, eventFeed, eventCounts } = get()
    if (!committed || actionLog.length === 0) return
    // vs AI 전용 — 핫시트(사람 2+)의 커밋 후 undo는 비공개 정보·분쟁 문제로 기본 비활성
    if (humanCount(committed) !== 1) return

    aiClient.cancelAll()
    // 가장 가까운 과거의 "사람 결정 시점"(사람이 currentPlayer인 스냅샷)으로 —
    // 중간 AI 턴들을 통째로 롤백한다
    const players = committed.config.players
    let i = actionLog.length - 1
    while (i > 0 && players[snapshots[i]!.currentPlayer]!.type !== 'human') i--

    const target = snapshots[i]!
    const feedLength = eventCounts.slice(0, i).reduce((a, b) => a + b, 0)
    const log = actionLog.slice(0, i)
    set({
      committed: target,
      actionLog: log,
      snapshots: snapshots.slice(0, i + 1),
      eventFeed: eventFeed.slice(0, feedLength),
      eventCounts: eventCounts.slice(0, i),
      ...UI_RESET,
    })
    saveGame(target.config, log, target)
    get().maybeRunAi() // AI가 선일 때 0까지 되돌린 경우
  },

  abandonGame: () => {
    clearSave()
    aiClient.cancelAll()
    set({
      committed: null,
      actionLog: [],
      snapshots: [],
      eventFeed: [],
      eventCounts: [],
      ...UI_RESET,
    })
  },
}))

/** 무를 수 있는가: 사람 1명 게임이고, 로그에 "사람의 결정"이 하나라도 있어야 한다
 *  (AI 수만 있는 상태의 무르기는 같은 수 재생 = 체감 no-op) */
export function canUndo(s: Pick<GameStore, 'committed' | 'actionLog' | 'snapshots'>): boolean {
  const { committed, actionLog, snapshots } = s
  if (!committed || actionLog.length === 0) return false
  if (humanCount(committed) !== 1) return false
  return snapshots.some(
    (snap, i) =>
      i < actionLog.length && snap.config.players[snap.currentPlayer]?.type === 'human',
  )
}

/** 집기 조립 상태 → 확정할 액션 (없으면 null) */
export function buildPickAction(picks: readonly GemColor[]): Action | null {
  if (picks.length === 0) return null
  if (picks.length === 2 && picks[0] === picks[1]) {
    return { type: 'TAKE_SAME', color: picks[0]! }
  }
  return { type: 'TAKE_DIFFERENT', colors: picks }
}

/**
 * 화면 렌더 기준 시점: 현재 차례가 사람이면 그 사람.
 * AI 차례면 "직전에 행동한 사람"(기기를 들고 있을 사람) — 다음 사람 시점을 쓰면
 * 핫시트(사람 2+)에서 아직 기기를 든 이전 사람에게 다음 사람의 비공개 정보가 샌다.
 */
export function viewerIndexFor(state: GameState): number {
  const kinds = state.config.players
  const n = kinds.length
  if (kinds[state.currentPlayer]?.type === 'human') return state.currentPlayer
  for (let d = 1; d <= n; d++) {
    const i = (state.currentPlayer - d + n) % n
    if (kinds[i]?.type === 'human') return i
  }
  return state.currentPlayer // 전원 AI — 관전
}
