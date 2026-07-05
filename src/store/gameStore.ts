// Zustand 단일 스토어 (docs/ARCHITECTURE.md §4)
// actionLog가 단일 진실원 — committed/snapshots는 파생 캐시.
// UI 전용 임시 상태(pendingPicks 등)는 엔진 상태와 절대 혼합하지 않는다.

import { create } from 'zustand'
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
  snapshots: GameState[] // actionLog.length + 1개 — undo O(1) (vs AI undo는 M5)
  eventFeed: GameEvent[]

  // ── UI 전용 임시 상태 ──
  lastEvents: GameEvent[] // 직전 액션의 이벤트 묶음 — Announcer 낭독용
  pendingPicks: GemColor[] // 토큰 집기 조립 중 (같은 색 2개 = [c, c])
  selectedCard: CardId | null
  selectedDeck: 1 | 2 | 3 | null
  handoffPending: boolean // 핫시트 기기 전달 대기
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
  abandonGame: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  committed: null,
  actionLog: [],
  snapshots: [],
  eventFeed: [],
  lastEvents: [],
  pendingPicks: [],
  selectedCard: null,
  selectedDeck: null,
  handoffPending: false,
  lastError: null,

  newGame: (config) => {
    const initial = setupGame(config)
    // 액션 0개짜리 세이브를 즉시 기록 — 첫 수 전 새로고침에도 게임이 유실되지 않는다
    saveGame(initial.config, [], initial)
    set({
      committed: initial,
      actionLog: [],
      snapshots: [initial],
      eventFeed: [],
      lastEvents: [],
      pendingPicks: [],
      selectedCard: null,
      selectedDeck: null,
      handoffPending: false,
      lastError: null,
    })
  },

  loadSaved: () => {
    const result = loadGame()
    if (!result.ok) return result.reason
    // 스냅샷 재구성 (undo 대비 — 구조적 공유라 저렴)
    let s = setupGame(result.state.config)
    const snapshots: GameState[] = [s]
    const eventFeed: GameEvent[] = []
    for (const action of result.actions) {
      const outcome = applyAction(s, action)
      s = outcome.state
      snapshots.push(s)
      eventFeed.push(...outcome.events)
    }
    set({
      committed: s,
      actionLog: [...result.actions],
      snapshots,
      eventFeed,
      lastEvents: [],
      pendingPicks: [],
      selectedCard: null,
      selectedDeck: null,
      // 로드 직후에는 누가 기기를 들고 있는지 알 수 없다 —
      // 항상 핸드오프 게이트를 세워 비공개 정보 노출을 막는다 (§9-O)
      handoffPending: s.phase.kind !== 'gameOver',
      lastError: null,
    })
    return null
  },

  dispatch: (action) => {
    const { committed, actionLog, snapshots, eventFeed } = get()
    if (!committed) return
    const v = validateAction(committed, action)
    if (!v.ok) {
      set({ lastError: `${v.messageKo} (${v.rule})` })
      return
    }
    const { state, events } = applyAction(committed, action)
    const log = [...actionLog, action]
    // 사람↔사람 턴 전환 시에만 기기 전달 오버레이 (phase 중간 단계는 같은 플레이어)
    const turnEnded = events.some((e) => e.t === 'turnEnded')
    set({
      committed: state,
      actionLog: log,
      snapshots: [...snapshots, state],
      eventFeed: [...eventFeed, ...events],
      lastEvents: [...events],
      pendingPicks: [],
      selectedCard: null,
      selectedDeck: null,
      handoffPending: turnEnded && state.phase.kind !== 'gameOver',
      lastError: null,
    })
    saveGame(state.config, log, state)
  },

  togglePick: (color) => {
    const { committed, pendingPicks } = get()
    if (!committed || committed.phase.kind !== 'play') return
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
          a.type === 'TAKE_DIFFERENT' &&
          next.every((c) => count(a.colors, c) >= count(next, c)),
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

  selectCard: (id) =>
    set({ selectedCard: id, selectedDeck: null, pendingPicks: [], lastError: null }),

  selectDeck: (tier) =>
    set({ selectedDeck: tier, selectedCard: null, pendingPicks: [], lastError: null }),

  acknowledgeHandoff: () => set({ handoffPending: false }),

  dismissError: () => set({ lastError: null }),

  abandonGame: () => {
    clearSave()
    set({
      committed: null,
      actionLog: [],
      snapshots: [],
      eventFeed: [],
      lastEvents: [],
      pendingPicks: [],
      selectedCard: null,
      selectedDeck: null,
      handoffPending: false,
      lastError: null,
    })
  },
}))

/** 집기 조립 상태 → 확정할 액션 (없으면 null) */
export function buildPickAction(picks: readonly GemColor[]): Action | null {
  if (picks.length === 0) return null
  if (picks.length === 2 && picks[0] === picks[1]) {
    return { type: 'TAKE_SAME', color: picks[0]! }
  }
  return { type: 'TAKE_DIFFERENT', colors: picks }
}
