// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayGame } from '../../src/tray/screens/TrayGame'
import { useGameStore } from '../../src/store/gameStore'
import { baseState, patchPlayer, gems } from '../helpers'
import type { GameState } from '../../src/engine'

function humanVsAi(overrides: Partial<GameState> = {}): GameState {
  const s = baseState(2, 42, { currentPlayer: 0, ...overrides })
  return {
    ...s,
    config: {
      ...s.config,
      players: [
        { type: 'human', name: '나' },
        { type: 'ai', name: 'AI', difficulty: 'easy' },
      ],
    },
  }
}

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayGame 접힘 뷰', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('내 차례 표시 + 점수 N/15', () => {
    const s = humanVsAi()
    const withScore = patchPlayer(s, 0, { prestige: 4, bonuses: gems({ white: 1 }) })
    useGameStore.setState({ committed: withScore })
    render(<TrayGame committed={withScore} />)
    expect(screen.getByText(/내 차례/)).toBeTruthy()
    expect(screen.getByText(/4\s*\/\s*15/)).toBeTruthy()
  })

  it('AI 차례 + aiThinking이면 "생각 중" 표시', () => {
    const s = humanVsAi({ currentPlayer: 1 })
    useGameStore.setState({ committed: s, aiThinking: true })
    render(<TrayGame committed={s} />)
    expect(screen.getByText(/생각 중/)).toBeTruthy()
  })

  it('[보드] 토글 → aria-pressed 반전 + 패널 컨테이너 등장/소멸', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    const boardBtn = screen.getByRole('button', { name: '보드' })
    expect(boardBtn.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()

    await user.click(boardBtn)
    expect(boardBtn.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()

    await user.click(boardBtn)
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()
  })

  it('[상대]/[귀족] 버튼도 존재한다', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(screen.getByRole('button', { name: '상대' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '귀족' })).toBeTruthy()
  })
})
