// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('TrayApp 상단 바·Esc', () => {
  beforeEach(resetStore)
  afterEach(() => { cleanup(); delete (window as { tray?: unknown }).tray })

  it('상단 바가 항상 렌더된다', () => {
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-titlebar]')).toBeTruthy()
  })

  it('Esc: 팝오버 닫힘 상태면 window.tray.hide()', () => {
    const hide = vi.fn()
    ;(window as unknown as { tray: unknown }).tray = { hide, onTheme: () => () => {}, onOpacity: () => () => {} }
    render(<TrayApp />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('Esc: 팝오버 열림이면 팝오버만 닫고 hide 안 함', () => {
    const hide = vi.fn()
    ;(window as unknown as { tray: unknown }).tray = { hide, onTheme: () => () => {}, onOpacity: () => () => {} }
    render(<TrayApp />)
    fireEvent.click(screen.getByLabelText('투명도')) // 팝오버 열기
    expect(screen.queryByLabelText('투명도 조절')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByLabelText('투명도 조절')).toBeNull()
    expect(hide).not.toHaveBeenCalled()
  })
})
