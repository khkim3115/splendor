// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayApp } from '../../src/tray/TrayApp'
import { useGameStore } from '../../src/store/gameStore'
import { baseState } from '../helpers'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayApp 라우팅', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('committed==null → 설정 화면', () => {
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="setup"]')).toBeTruthy()
  })

  it('진행 중 → 게임 화면', () => {
    useGameStore.setState({ committed: baseState(2, 42) })
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="game"]')).toBeTruthy()
  })

  it('gameOver → 결과 화면', () => {
    const s = baseState(2, 42, {
      phase: {
        kind: 'gameOver',
        result: {
          winners: [0],
          scores: [
            { prestige: 15, purchasedCount: 8 },
            { prestige: 10, purchasedCount: 6 },
          ],
          reason: 'prestige15',
        },
      },
    })
    useGameStore.setState({ committed: s })
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="result"]')).toBeTruthy()
  })
})
