// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayApp } from '../../src/tray/TrayApp'
import { useGameStore } from '../../src/store/gameStore'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayApp 테마 구독', () => {
  beforeEach(() => {
    resetStore()
    document.documentElement.removeAttribute('data-theme')
    delete (window as { tray?: unknown }).tray
  })
  afterEach(cleanup)

  it('window.tray 없으면 기본 다크로 설정된다', () => {
    render(<TrayApp />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('window.tray.onTheme이 푸시한 테마를 data-theme에 반영한다', () => {
    let pushed: ((t: 'light' | 'dark') => void) | null = null
    ;(window as unknown as { tray: { onTheme: (cb: (t: 'light' | 'dark') => void) => void } }).tray = {
      onTheme: (cb) => {
        pushed = cb
      },
    }
    render(<TrayApp />)
    expect(pushed).not.toBeNull()
    pushed!('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    pushed!('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
