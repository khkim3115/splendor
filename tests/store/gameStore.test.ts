// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { hashState } from '../../src/engine/serialize'
import { buildPickAction, useGameStore } from '../../src/store/gameStore'
import { config, patchPlayer, tokens } from '../helpers'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
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
}

const store = () => useGameStore.getState()

describe('gameStore', () => {
  beforeEach(resetStore)

  it('newGame → dispatch → actionLog가 단일 진실원으로 쌓인다', () => {
    store().newGame(config(2, 42))
    expect(store().committed).not.toBeNull()
    expect(store().snapshots).toHaveLength(1)

    store().dispatch({ type: 'TAKE_SAME', color: 'red' })
    expect(store().actionLog).toHaveLength(1)
    expect(store().snapshots).toHaveLength(2)
    expect(store().eventFeed.map((e) => e.t)).toEqual(['tokensTaken', 'turnEnded'])
    expect(store().handoffPending).toBe(true) // 사람↔사람 턴 전환
    expect(store().committed!.currentPlayer).toBe(store().committed!.startPlayer === 0 ? 1 : 0)
  })

  it('불법 액션은 §번호 사유와 함께 거절되고 상태가 변하지 않는다', () => {
    store().newGame(config(2, 42))
    const before = hashState(store().committed!)
    store().dispatch({ type: 'PASS' })
    expect(store().lastError).toContain('§9-G')
    expect(hashState(store().committed!)).toBe(before)
    expect(store().actionLog).toHaveLength(0)
  })

  it('togglePick: 같은 색 2회 = TAKE_SAME, 재클릭 = 되돌려놓기, 조합 제한', () => {
    store().newGame(config(2, 42))
    store().togglePick('red')
    store().togglePick('red')
    expect(store().pendingPicks).toEqual(['red', 'red'])
    expect(buildPickAction(store().pendingPicks)).toEqual({ type: 'TAKE_SAME', color: 'red' })

    // 같은 색 2개 상태에서 다른 색 추가 불가
    store().togglePick('blue')
    expect(store().lastError).toContain('§4')
    expect(store().pendingPicks).toEqual(['red', 'red'])

    // 재클릭으로 전부 되돌려놓기
    store().togglePick('red')
    expect(store().pendingPicks).toEqual([])

    store().togglePick('red')
    store().togglePick('blue')
    store().togglePick('green')
    expect(buildPickAction(store().pendingPicks)).toEqual({
      type: 'TAKE_DIFFERENT',
      colors: ['red', 'blue', 'green'],
    })
    store().togglePick('white')
    expect(store().lastError).toContain('§4.1')
  })

  it('저장/이어하기: 새로고침 시뮬레이션 후 hashState가 정확히 일치한다', () => {
    store().newGame(config(2, 42))
    store().dispatch({ type: 'TAKE_SAME', color: 'red' })
    store().dispatch({ type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] })
    const beforeHash = hashState(store().committed!)
    const beforeFeed = store().eventFeed.length

    resetStoreStateOnly() // localStorage는 유지 (새로고침 시뮬레이션)
    expect(store().committed).toBeNull()

    const error = store().loadSaved()
    expect(error).toBeNull()
    expect(hashState(store().committed!)).toBe(beforeHash)
    expect(store().actionLog).toHaveLength(2)
    expect(store().eventFeed.length).toBe(beforeFeed) // 로그도 재구성된다
  })

  it('newGame 직후(첫 수 전)에도 이어하기가 가능하다 — 액션 0개 세이브', () => {
    store().newGame(config(2, 42))
    const beforeHash = hashState(store().committed!)

    resetStoreStateOnly()
    const error = store().loadSaved()
    expect(error).toBeNull()
    expect(hashState(store().committed!)).toBe(beforeHash)
    expect(store().actionLog).toHaveLength(0)
  })

  it('로드 직후에는 항상 핸드오프 게이트가 선다 (§9-O — 누가 기기를 들고 있는지 모른다)', () => {
    store().newGame(config(2, 42))
    store().dispatch({ type: 'RESERVE_DECK', tier: 1 }) // 비공개 예약 포함 상태
    resetStoreStateOnly()
    store().loadSaved()
    expect(store().handoffPending).toBe(true)
  })

  it('togglePick 판정이 엔진 기반이다 — 2색만 남은 공급에서 3색째 추가 거절', () => {
    store().newGame(config(2, 42))
    useGameStore.setState({
      committed: {
        ...store().committed!,
        supply: tokens({ red: 2, blue: 1, gold: 5 }),
      },
    })
    store().togglePick('red')
    store().togglePick('blue')
    expect(store().pendingPicks).toEqual(['red', 'blue'])
    store().togglePick('green') // 공급 0 — 어떤 합법 조합으로도 확장 불가
    expect(store().lastError).toContain('§4.1')
    expect(store().pendingPicks).toEqual(['red', 'blue'])
  })

  it('세이브 변조(finalHash 불일치)는 한국어 안내와 함께 거부된다', () => {
    store().newGame(config(2, 42))
    store().dispatch({ type: 'TAKE_SAME', color: 'red' })

    const raw = JSON.parse(localStorage.getItem('splendor:save')!) as { finalHash: string }
    raw.finalHash = 'deadbeef'
    localStorage.setItem('splendor:save', JSON.stringify(raw))

    resetStoreStateOnly()
    const error = store().loadSaved()
    expect(error).toContain('이어할 수 없습니다')
    expect(store().committed).toBeNull()
  })

  it('phase 중간 단계(반납)에서는 핸드오프가 뜨지 않는다', () => {
    store().newGame(config(2, 42))
    useGameStore.setState({
      committed: patchPlayer(store().committed!, store().committed!.currentPlayer, {
        tokens: tokens({ white: 4, blue: 4 }),
      }),
    })
    store().dispatch({ type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(store().committed!.phase.kind).toBe('discard')
    expect(store().handoffPending).toBe(false) // 아직 같은 플레이어의 결정이 남았다

    store().dispatch({ type: 'DISCARD', tokens: tokens({ white: 1 }) })
    expect(store().handoffPending).toBe(true)
  })
})

function resetStoreStateOnly(): void {
  useGameStore.setState({
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
}
