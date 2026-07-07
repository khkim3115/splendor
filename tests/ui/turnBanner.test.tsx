// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { legalActions } from '../../src/engine/legal'
import { useGameStore } from '../../src/store/gameStore'
import { config } from '../helpers'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null,
    actionLog: [],
    snapshots: [],
    eventFeed: [],
    eventCounts: [],
    lastEvents: [],
    pendingPicks: [],
    selectedCard: null,
    selectedDeck: null,
    handoffPending: false,
    aiThinking: false,
    lastError: null,
  })
}

/** 현재 committed에 legalActions[0]을 두고, 핫시트 핸드오프가 걸리면 인계한다 */
function playOneMove(): void {
  const s = useGameStore.getState()
  const legal = legalActions(s.committed!)
  act(() => useGameStore.getState().dispatch(legal[0]!))
  if (useGameStore.getState().handoffPending) {
    act(() => useGameStore.getState().acknowledgeHandoff())
  }
}

describe('TurnBanner — 라운드 표시 (이슈 #14)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('새 게임 직후 1라운드가 표시된다', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    expect(screen.getByText('1라운드')).toBeTruthy()
  })

  it('라운드 텍스트는 role="status" 라이브 영역이다 (접근성)', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    const round = screen.getByText('1라운드')
    expect(round.getAttribute('role')).toBe('status')
    expect(round.getAttribute('aria-live')).toBe('polite')
  })

  it('2인전에서 각자 1수씩 두면 2라운드로 갱신된다', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    expect(screen.getByText('1라운드')).toBeTruthy()
    playOneMove() // P1
    playOneMove() // P2 → turn 2 → 라운드 2
    expect(screen.getByText('2라운드')).toBeTruthy()
    expect(screen.queryByText('1라운드')).toBeNull()
  })
})
