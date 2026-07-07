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

  it('보드 펼침: 3티어 격자 + 공개 카드 코드 + 공급 토큰이 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '보드' }))

    const panel = document.querySelector('[data-tray-panel="board"]')!
    // 3티어 행이 있다
    expect(panel.querySelectorAll('[data-tray-tier]')).toHaveLength(3)
    // 첫 공개 카드의 코드가 어딘가 렌더된다
    const firstCard = s.board[0]!.find((id) => id !== null)!
    const { cardCode } = await import('../../src/tray/format')
    const { CARDS } = await import('../../src/engine')
    expect(panel.textContent).toContain(cardCode(CARDS[firstCard]!, 'ko'))
    // 공급 영역 존재
    expect(panel.querySelector('[data-tray-supply]')).toBeTruthy()
  })

  it('상대 펼침: 나를 제외한 상대 요약이 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    const withAi = patchPlayer(s, 1, { prestige: 7 })
    useGameStore.setState({ committed: withAi })
    render(<TrayGame committed={withAi} />)
    await user.click(screen.getByRole('button', { name: '상대' }))

    const panel = document.querySelector('[data-tray-panel="opponents"]')!
    const rows = panel.querySelectorAll('[data-opp-index]')
    expect(rows).toHaveLength(1) // 2인전 → 상대 1명
    expect(panel.textContent).toContain('AI')
    expect(panel.textContent).toContain('7점')
  })

  it('귀족 펼침: 남은 귀족 요구조건이 코드로 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '귀족' }))

    const panel = document.querySelector('[data-tray-panel="nobles"]')!
    const { NOBLES } = await import('../../src/engine')
    const items = panel.querySelectorAll('[data-noble-id]')
    expect(items.length).toBe(s.nobles.length)
    expect(items.length).toBeGreaterThan(0)
    // 첫 귀족의 요구 색 중 하나의 코드가 텍스트에 있다
    const req = NOBLES[s.nobles[0]!]!.requirement
    const someColor = (['white','blue','green','red','black'] as const).find((c) => req[c] > 0)!
    const code = { white:'흰', blue:'파', green:'초', red:'빨', black:'검' }[someColor]
    expect(panel.textContent).toContain(code)
  })
})
