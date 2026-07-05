// @vitest-environment jsdom
// UI 스모크 테스트 (docs/ARCHITECTURE.md §6-6) — 룰은 엔진에 있으므로
// 여기서는 화면 연결과 인터랙션 경로만 검증한다.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { setAiDelayScale } from '../../src/ai/client'
import { setupGame } from '../../src/engine/setup'
import { cardKo } from '../../src/ui/i18n/ko'
import { useGameStore } from '../../src/store/gameStore'
import { baseState, config, gems, patchPlayer, tokens } from '../helpers'

setAiDelayScale(0)

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

describe('UI 스모크', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('셋업 → 게임 시작 → 첫 플레이어의 차례 배너가 뜬다', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: '스플랜더' })).toBeTruthy()

    await user.clear(screen.getByLabelText('1번 자리'))
    await user.type(screen.getByLabelText('1번 자리'), '철수')
    await user.type(screen.getByLabelText('시드 (선택)'), '42')
    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(screen.getByText(/님의 차례/)).toBeTruthy()
    expect(screen.getByLabelText('토큰 공급처')).toBeTruthy()
  })

  it('토큰 3개 집기 → 확정 → 로그 기록 + 핸드오프 오버레이', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)

    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^에메랄드 토큰/))
    await user.click(screen.getByLabelText(/^사파이어 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))

    const log = screen.getByLabelText('게임 로그')
    expect(within(log).getByText(/루비 1개.*획득|획득/)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '기기 전달' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /준비 완료/ }))
    expect(screen.queryByRole('dialog', { name: '기기 전달' })).toBeNull()
  })

  it('낭독(aria-live)에 직전 행동의 내용이 담긴다 — 마지막 이벤트만이 아니라', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)

    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))

    const live = document.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toContain('획득')
    expect(live.textContent).toContain('차례')
  })

  it('같은 색 2개 상태에서 다른 색 추가 시 사유가 표시된다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)

    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^사파이어 토큰/))
    // 엔진의 validateAction 메시지가 그대로 표시된다 (§4.1 중복)
    expect(screen.getByText(/같은 색을 중복해서 가져올 수 없습니다.*§4\.1/)).toBeTruthy()
  })

  it('구매 불가 카드는 버튼이 비활성화되고, 예약은 가능하다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)

    // 빈손이므로 아무 3티어 카드나 구매 불가
    const committed = useGameStore.getState().committed!
    const tier3Card = committed.board[2]![0]!
    await user.click(screen.getByLabelText(cardKo(tier3Card)))

    const buyButton = screen.getByRole('button', { name: '구매' })
    expect((buyButton as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: '예약' }))
    const log = screen.getByLabelText('게임 로그')
    expect(within(log).getByText(/예약/)).toBeTruthy()
  })

  it('반납 모달이 강제로 열리고 정확한 개수를 채워야 확정된다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    const s = useGameStore.getState().committed!
    useGameStore.setState({
      committed: patchPlayer(s, s.currentPlayer, { tokens: tokens({ white: 4, blue: 4 }) }),
    })
    render(<App />)

    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^에메랄드 토큰/))
    await user.click(screen.getByLabelText(/^오닉스 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))

    const dialog = screen.getByRole('dialog', { name: '토큰 반납' })
    const confirm = within(dialog).getByRole('button', { name: '반납 확정' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    await user.click(within(dialog).getByLabelText('다이아몬드 반납 늘리기'))
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    await user.click(confirm)
    expect(screen.queryByRole('dialog', { name: '토큰 반납' })).toBeNull()
  })

  it('복수 귀족 충족 시 선택 모달이 뜨고 선택하면 점수에 반영된다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    const s = useGameStore.getState().committed!
    useGameStore.setState({
      committed: patchPlayer({ ...s, nobles: [0, 1] }, s.currentPlayer, {
        bonuses: gems({ green: 3, red: 4, black: 4 }),
      }),
    })
    render(<App />)

    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))

    const dialog = screen.getByRole('dialog', { name: '귀족 선택' })
    const choices = within(dialog).getAllByRole('button', { name: /이 귀족 맞이하기/ })
    expect(choices).toHaveLength(2)
    await user.click(choices[0]!)

    const log = screen.getByLabelText('게임 로그')
    expect(within(log).getByText(/귀족.*방문! \+3점/)).toBeTruthy()
  })

  it('§9-O: 핸드오프 중 상대의 덱 비공개 예약 카드 정보가 DOM에 없다', () => {
    useGameStore.getState().newGame(config(2, 42))
    const s = useGameStore.getState().committed!
    const hiddenCard = s.decks[2]![0]!
    // P(다른 플레이어)가 덱에서 비공개 예약한 상황 — 현재 차례 플레이어의 화면
    const other = (s.currentPlayer + 1) % 2
    useGameStore.setState({
      committed: patchPlayer(s, other, {
        reserved: [{ cardId: hiddenCard, fromDeck: true }],
      }),
      handoffPending: true,
    })
    render(<App />)

    expect(screen.getByRole('dialog', { name: '기기 전달' })).toBeTruthy()
    // 카드 정체(비용·점수·색)가 DOM 어디에도 없어야 한다
    expect(screen.queryByLabelText(cardKo(hiddenCard))).toBeNull()
    expect(document.querySelector(`[data-card-id="${hiddenCard}"]`)).toBeNull()
    // 뒷면 표시는 존재한다
    expect(screen.getAllByLabelText('비공개 카드').length).toBeGreaterThan(0)
  })

  it('AI 좌석 게임: 사람이 두면 AI가 자동으로 응수하고 무르기가 동작한다', async () => {
    const user = userEvent.setup()
    const players = [
      { type: 'human', name: '사람' },
      { type: 'ai', name: 'AI', difficulty: 'easy' },
    ] as const
    // 사람(0번)이 선이 되는 시드를 결정적으로 찾는다
    let seed = 42
    while (setupGame({ players, seed }).startPlayer !== 0) seed++
    useGameStore.getState().newGame({ players, seed })
    render(<App />)

    // 사람 1명 + AI → 핸드오프 오버레이가 없어야 한다
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))
    expect(screen.queryByRole('dialog', { name: '기기 전달' })).toBeNull()

    // AI가 자동으로 응수한다
    await vi.waitFor(() => {
      expect(useGameStore.getState().actionLog.length).toBeGreaterThanOrEqual(2)
      expect(useGameStore.getState().aiThinking).toBe(false)
    })

    // 무르기 → 내 직전 결정 시점(게임 시작)으로 롤백
    await user.click(screen.getByRole('button', { name: /한 수 무르기/ }))
    expect(useGameStore.getState().actionLog).toHaveLength(0)
    expect(useGameStore.getState().committed!.currentPlayer).toBe(
      useGameStore.getState().committed!.startPlayer,
    )
  })

  it('AI 차례에 선 핸드오프 게이트는 AI가 아니라 사람을 지목한다 (§9-O)', () => {
    // [사람, 사람, AI] — AI 차례 저장본을 로드한 상황 시뮬레이션
    const s = baseState(3, 42, { currentPlayer: 2 })
    const withKinds = {
      ...s,
      config: {
        ...s.config,
        players: [
          { type: 'human', name: '갑' },
          { type: 'human', name: '을' },
          { type: 'ai', name: 'AI 쉬움', difficulty: 'easy' },
        ] as const,
      },
    }
    useGameStore.setState({ committed: withKinds, handoffPending: true, aiThinking: true })
    render(<App />)

    const dialog = screen.getByRole('dialog', { name: '기기 전달' })
    // AI가 아닌 사람(직전 행동자 = 을)을 지목한다
    expect(within(dialog).queryByText(/AI 쉬움 준비 완료/)).toBeNull()
    expect(within(dialog).getByRole('button', { name: /을 준비 완료 — 계속/ })).toBeTruthy()
  })

  it('게임 종료 상태면 결과 화면이 뜨고 동점 근거가 표시된다', () => {
    const s = baseState(2, 42, {
      phase: {
        kind: 'gameOver',
        result: {
          winners: [1],
          scores: [
            { prestige: 15, purchasedCount: 9 },
            { prestige: 15, purchasedCount: 7 },
          ],
          reason: 'prestige15',
        },
      },
    })
    useGameStore.setState({ committed: s })
    render(<App />)

    expect(screen.getByText(/승자: P2/)).toBeTruthy()
    expect(screen.getByText(/동점 — 구매한 개발 카드 수가 더 적어 승리/)).toBeTruthy()
  })
})
