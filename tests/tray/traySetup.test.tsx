// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TraySetup } from '../../src/tray/screens/TraySetup'
import { setAiDelayScale } from '../../src/ai/client'
import { useGameStore } from '../../src/store/gameStore'

setAiDelayScale(0)

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TraySetup', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('3인 + 어려움 선택 → 사람1 + AI2(hard) config로 newGame', async () => {
    const user = userEvent.setup()
    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '3인' }))
    await user.click(screen.getByRole('button', { name: '어려움' }))
    await user.click(screen.getByRole('button', { name: '시작' }))

    const players = useGameStore.getState().committed!.config.players
    expect(players).toHaveLength(3)
    expect(players[0]!.type).toBe('human')
    expect(players[1]).toMatchObject({ type: 'ai', difficulty: 'hard' })
    expect(players[2]).toMatchObject({ type: 'ai', difficulty: 'hard' })
  })

  it('기본값: 2인·보통', async () => {
    const user = userEvent.setup()
    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '시작' }))
    const players = useGameStore.getState().committed!.config.players
    expect(players).toHaveLength(2)
    expect(players[1]).toMatchObject({ type: 'ai', difficulty: 'normal' })
  })

  it('세이브 없으면 이어하기 버튼이 없다', () => {
    render(<TraySetup />)
    expect(screen.queryByRole('button', { name: '이어하기' })).toBeNull()
  })

  it('세이브 있으면 이어하기 노출, 클릭 시 loadSaved로 복원', async () => {
    const user = userEvent.setup()
    // 세이브를 하나 만든다: 새 게임(액션 0개짜리 세이브가 즉시 기록됨) 후 스토어만 비운다
    useGameStore.getState().newGame({
      players: [
        { type: 'human', name: '나' },
        { type: 'ai', name: 'AI', difficulty: 'easy' },
      ],
      seed: 42,
    })
    // 스토어를 설정 화면 상태로 되돌리되 localStorage 세이브는 남긴다
    useGameStore.setState({
      committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    })

    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '이어하기' }))
    expect(useGameStore.getState().committed).not.toBeNull()
  })
})
