// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayResult } from '../../src/tray/screens/TrayResult'
import { useGameStore } from '../../src/store/gameStore'
import { baseState } from '../helpers'
import type { GameResult } from '../../src/engine'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayResult', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('단독 승자와 점수를 표시한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 15, purchasedCount: 8 },
        { prestige: 11, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/승자/)).toBeTruthy()
    expect(screen.getByText(/15/)).toBeTruthy()
  })

  it('공동 승리를 표기한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0, 1],
      scores: [
        { prestige: 15, purchasedCount: 7 },
        { prestige: 15, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/공동/)).toBeTruthy()
  })

  it('교착 종료 사유를 표기한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 9, purchasedCount: 12 },
        { prestige: 8, purchasedCount: 11 },
      ],
      reason: 'deadlockExhausted',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/교착/)).toBeTruthy()
  })

  it('새 게임 버튼이 abandonGame을 호출한다', async () => {
    const user = userEvent.setup()
    const committed = baseState(2, 42)
    useGameStore.setState({ committed })
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 15, purchasedCount: 8 },
        { prestige: 11, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    await user.click(screen.getByRole('button', { name: '새 게임' }))
    expect(useGameStore.getState().committed).toBeNull()
  })
})
