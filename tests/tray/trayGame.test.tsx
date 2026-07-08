// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAiDelayScale } from '../../src/ai/client'
import { TrayGame } from '../../src/tray/screens/TrayGame'
import { useGameStore } from '../../src/store/gameStore'
import { baseState, patchPlayer, gems, tokens } from '../helpers'
import type { GameState } from '../../src/engine'

setAiDelayScale(0)

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

  it('상대 펼침: 현재 차례인 상대 행에만 ▸ 마커가 붙는다 (AI 차례)', async () => {
    const user = userEvent.setup()
    const s = humanVsAi({ currentPlayer: 1 })
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '상대' }))

    const panel = document.querySelector('[data-tray-panel="opponents"]')!
    const row = panel.querySelector('[data-opp-index="1"]')!
    expect(row.getAttribute('data-current')).toBe('true')
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(row.textContent).toContain('▸')
  })

  it('상대 펼침: 내 차례(human)면 어떤 상대 행에도 ▸ 마커가 없다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi({ currentPlayer: 0 })
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '상대' }))

    const panel = document.querySelector('[data-tray-panel="opponents"]')!
    const row = panel.querySelector('[data-opp-index="1"]')!
    expect(row.getAttribute('data-current')).not.toBe('true')
    expect(row.hasAttribute('aria-current')).toBe(false)
    expect(row.textContent).not.toContain('▸')
  })

  it('귀족 펼침: "귀족" 섹션 헤더만 있고 👑 이모지는 없다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '귀족' }))

    const panel = document.querySelector('[data-tray-panel="nobles"]')!
    expect(panel.getAttribute('aria-label')).toBe('귀족')
    expect(panel.textContent).not.toContain('👑')
  })

  it('3인전: 나를 제외한 상대 전원이 행으로 렌더되고, 현재 차례인 상대만 ▸ 마커를 갖는다', async () => {
    const user = userEvent.setup()
    const s3 = baseState(3, 7, { currentPlayer: 2 })
    const s: GameState = {
      ...s3,
      config: {
        ...s3.config,
        players: [
          { type: 'human', name: '나' },
          { type: 'ai', name: 'AI-1', difficulty: 'easy' },
          { type: 'ai', name: 'AI-2', difficulty: 'easy' },
        ],
      },
    }
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '상대' }))

    const panel = document.querySelector('[data-tray-panel="opponents"]')!
    const rows = panel.querySelectorAll('[data-opp-index]')
    expect(rows).toHaveLength(2) // 3인전 → 나를 제외한 상대 2명

    const row1 = panel.querySelector('[data-opp-index="1"]')!
    const row2 = panel.querySelector('[data-opp-index="2"]')!
    // 현재 차례(플레이어 2)만 마커를 갖는다
    expect(row1.getAttribute('data-current')).not.toBe('true')
    expect(row2.getAttribute('data-current')).toBe('true')
    expect(row2.textContent).toContain('▸')
    expect(row1.textContent).not.toContain('▸')

    const noblesPanel0 = document.querySelector('[data-tray-panel="nobles"]')
    expect(noblesPanel0).toBeNull()
    await user.click(screen.getByRole('button', { name: '귀족' }))
    const noblesPanel = document.querySelector('[data-tray-panel="nobles"]')!
    expect(noblesPanel.getAttribute('aria-label')).toBe('귀족')
    expect(noblesPanel.textContent).not.toContain('👑')
  })
})

describe('TrayGame 플레이 배선 (play)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('토큰 3색 집기 → 확정 → actionLog 기록', async () => {
    const user = userEvent.setup()
    const { setupGame } = await import('../../src/engine')
    const players = [
      { type: 'human', name: '나' },
      { type: 'ai', name: 'AI', difficulty: 'easy' },
    ] as const
    let seed = 42
    while (setupGame({ players: [...players], seed }).startPlayer !== 0) seed++

    useGameStore.getState().newGame({ players: [...players], seed })
    const committed = useGameStore.getState().committed!
    render(<TrayGame committed={committed} />)

    await user.click(screen.getByRole('button', { name: '흰 집기' }))
    await user.click(screen.getByRole('button', { name: '파 집기' }))
    await user.click(screen.getByRole('button', { name: '초 집기' }))
    await user.click(screen.getByRole('button', { name: '확정' }))

    expect(useGameStore.getState().actionLog.length).toBeGreaterThanOrEqual(1)
  })

  it('불법 조합(공급<4인 색 2개)이면 lastError(§)가 표시된다', async () => {
    const user = userEvent.setup()
    // 빨 공급을 3개로 낮춰 TAKE_SAME 빨을 불법(§4.2)으로 만든다
    const s = humanVsAi({ supply: tokens({ white: 4, blue: 4, green: 4, red: 3, black: 4 }) })
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    // 빨 두 번 = TAKE_SAME 빨 조립 → 공급<4 → 엔진이 거부, lastError 세팅
    await user.click(screen.getByRole('button', { name: '빨 집기' }))
    await user.click(screen.getByRole('button', { name: '빨 집기' }))
    expect(screen.getByText(/§/)).toBeTruthy()
    expect(useGameStore.getState().lastError).toContain('§')
  })

  it('AI 차례에는 행동 바가 렌더되지 않는다', () => {
    const s = humanVsAi({ currentPlayer: 1 })
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(screen.queryByRole('button', { name: '흰 집기' })).toBeNull()
  })
})

describe('TrayGame 강제 페이즈 — discard (§5)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  /** 사람(0)이 10개 초과 토큰을 들고 반납해야 하는 상태 */
  function discardState(mustDiscard: 1 | 2 | 3): GameState {
    const s = humanVsAi({ phase: { kind: 'discard', mustDiscard } })
    // 흰 8 + 파 3 = 11개(2인전 공급은 각 4개지만 반납 상태 검증엔 무관)
    return patchPlayer(s, 0, { tokens: tokens({ white: 8, blue: 3 }) })
  }

  it('반납 affordance가 렌더되고 정확히 mustDiscard개 반납 시 phase가 play로 풀린다', async () => {
    const user = userEvent.setup()
    const s = discardState(1)
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    // 흰 토큰 1개 반납 선택 후 확정
    await user.click(screen.getByRole('button', { name: '흰 반납' }))
    await user.click(screen.getByRole('button', { name: '반납 확정' }))

    const after = useGameStore.getState().committed!
    // discard가 해소되어 더 이상 사람의 반납 대기가 아니다 (턴 종료 후 AI 진행 가능)
    expect(after.phase.kind).not.toBe('discard')
    expect(useGameStore.getState().actionLog[0]!.type).toBe('DISCARD')
    // 반납 후 사람(0)의 토큰 총량이 10개로 내려왔다 (§5)
    const { tokenTotal } = await import('../../src/engine')
    expect(tokenTotal(after.players[0]!.tokens)).toBe(10)
  })

  it('2개 반납: 두 색을 골라 확정하면 discard가 해소된다', async () => {
    const user = userEvent.setup()
    const s = discardState(2)
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    await user.click(screen.getByRole('button', { name: '흰 반납' }))
    await user.click(screen.getByRole('button', { name: '파 반납' }))
    await user.click(screen.getByRole('button', { name: '반납 확정' }))

    expect(useGameStore.getState().committed!.phase.kind).toBe('play')
  })

  it('부족하게 선택하면 확정 버튼이 비활성(반납 미완)', async () => {
    const user = userEvent.setup()
    const s = discardState(2)
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    await user.click(screen.getByRole('button', { name: '흰 반납' }))
    const confirm = screen.getByRole('button', { name: '반납 확정' })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    // 여전히 discard 페이즈
    expect(useGameStore.getState().committed!.phase.kind).toBe('discard')
  })
})

describe('TrayGame 강제 페이즈 — chooseNoble (§9-J)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  /** 사람(0)이 귀족 1·5를 동시 충족 → 선택 대기 */
  function nobleState(): GameState {
    const s = humanVsAi({
      phase: { kind: 'chooseNoble', options: [1, 5] },
      nobles: [1, 5],
    })
    return patchPlayer(s, 0, {
      bonuses: gems({ white: 3, green: 3, red: 3, black: 3 }),
    })
  }

  it('선택지 귀족이 렌더되고 하나 고르면 그 귀족을 획득하며 turn이 넘어간다', async () => {
    const user = userEvent.setup()
    const s = nobleState()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    const buttons = screen.getAllByRole('button', { name: /맞이/ })
    expect(buttons.length).toBe(2)
    await user.click(buttons[0]!)

    const after = useGameStore.getState().committed!
    expect(after.phase.kind).not.toBe('chooseNoble')
    expect(useGameStore.getState().actionLog[0]!.type).toBe('CHOOSE_NOBLE')
    // 귀족 1명을 획득 (사람이 이미 턴을 넘겼으면 currentPlayer가 AI)
    const claimed = after.players.some((p) => p.nobles.length === 1)
    expect(claimed).toBe(true)
  })
})

describe('TrayGame 강제 페이즈 — PASS-only (§9-G)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  /** 사람(0)에게 어떤 합법 play 행동도 없는 상태 (공급 0 · 예약 3 · 구매 불가) */
  function passOnlyState(): GameState {
    const s = humanVsAi()
    const emptyBoard = s.board.map((row) => row.map(() => null))
    return {
      ...s,
      supply: tokens(),
      decks: [[], [], []],
      board: emptyBoard,
      nobles: [],
      players: s.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              tokens: tokens(),
              bonuses: gems(),
              reserved: [
                { cardId: 40, fromDeck: false },
                { cardId: 41, fromDeck: false },
                { cardId: 42, fromDeck: false },
              ],
            }
          : p,
      ),
    } as GameState
  }

  it('합법 행동이 없으면 패스 affordance가 렌더되고 패스 시 턴이 넘어간다', async () => {
    const user = userEvent.setup()
    const s = passOnlyState()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    const pass = screen.getByRole('button', { name: '패스' })
    await user.click(pass)

    expect(useGameStore.getState().actionLog[0]!.type).toBe('PASS')
  })

  it('합법 행동이 있으면 패스 버튼은 렌더되지 않는다', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(screen.queryByRole('button', { name: '패스' })).toBeNull()
  })
})

describe('TrayGame 단축키', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('B 키 → 보드 펼침 토글', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()
    fireEvent.keyDown(document, { key: 'b' })
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()
  })

  it('1 키 → 토큰 집기(내 차례·play)', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    fireEvent.keyDown(document, { key: '1' })
    expect(useGameStore.getState().pendingPicks).toEqual(['white'])
  })

  it('Ctrl+B 는 무시(수식키) — 리스너 존재 + 조합 가드 둘 다 검증', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    // 먼저 'b' 로 보드를 연다(리스너가 실제로 붙어있음을 증명 — 접힘 기본값만으론 통과되는 공허한 검증 방지)
    fireEvent.keyDown(document, { key: 'b' })
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()

    // Ctrl+B 는 무시되어야 한다 → 방금 연 보드가 닫히지 않고 그대로 열려 있어야 한다
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true })
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()
  })

  it('L 키 → 언어 전환(헤더 코드 표시 한↔EN 토글)', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    const langBtn = screen.getByRole('button', { name: '글자코드 언어 전환' })
    const before = langBtn.textContent
    fireEvent.keyDown(document, { key: 'l' })
    expect(langBtn.textContent).not.toBe(before)

    fireEvent.keyDown(document, { key: 'l' })
    expect(langBtn.textContent).toBe(before)
  })

  it('Enter: 포커스가 취소 버튼이면 전역 확정으로 가로채지 않는다', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    // 서로 다른 색 3개 대기 조립(합법 TAKE_DIFFERENT — 숫자키 단축키 경유)
    fireEvent.keyDown(document, { key: '1' })
    fireEvent.keyDown(document, { key: '2' })
    fireEvent.keyDown(document, { key: '3' })
    expect(useGameStore.getState().pendingPicks).toEqual(['white', 'blue', 'green'])

    const cancelBtn = screen.getByRole('button', { name: '취소' })
    cancelBtn.focus()
    expect(document.activeElement).toBe(cancelBtn)

    // Enter 를 취소 버튼 위에서 발생시킨다(keydown 은 버블 → document 리스너까지 전파, e.target=버튼)
    fireEvent.keyDown(cancelBtn, { key: 'Enter' })

    // 전역 confirm 이 가로채 dispatch 됐다면 pendingPicks가 비워졌을 것 — 가로채지 않았어야 하므로 그대로 남는다
    expect(useGameStore.getState().pendingPicks).toEqual(['white', 'blue', 'green'])
    expect(useGameStore.getState().actionLog.length).toBe(0)
  })

  it('Enter: 포커스된 버튼이 없으면(body) 대기 집기를 실제로 확정 dispatch 한다', () => {
    // 반납(discard) 유도로 턴 종료·AI 자동응수를 피해 동기적으로 검증한다 —
    // 흰 8개를 이미 들고 있는 채로 흰/파/초 3색을 더 집으면 11개(§5 초과)로 discard 강제,
    // currentPlayer 는 그대로 사람이라 AI 는 호출되지 않는다.
    const s = patchPlayer(humanVsAi(), 0, { tokens: tokens({ white: 8 }) })
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    fireEvent.keyDown(document, { key: '1' })
    fireEvent.keyDown(document, { key: '2' })
    fireEvent.keyDown(document, { key: '3' })
    expect(useGameStore.getState().pendingPicks).toEqual(['white', 'blue', 'green'])

    // 포커스된 엘리먼트가 없으면(jsdom 기본값 = body) 확정이 가로채이지 않아야 한다
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(useGameStore.getState().actionLog).toHaveLength(1)
    expect(useGameStore.getState().actionLog[0]!.type).toBe('TAKE_DIFFERENT')
    expect(useGameStore.getState().pendingPicks).toEqual([])
    expect(useGameStore.getState().committed!.phase.kind).toBe('discard')
  })

  it('U 키 → 무르기(canUndo 일 때만) — 직전 사람 행동 시점으로 롤백', () => {
    // newGame 을 거치지 않고도 undo 불변식(snapshots[0] = 행동 전 상태)만 갖추면
    // 충분히 결정론적으로 검증할 수 있다. 위와 동일하게 discard 유도로 AI 자동응수를 피한다.
    const s = patchPlayer(humanVsAi(), 0, { tokens: tokens({ white: 8 }) })
    useGameStore.setState({ committed: s, snapshots: [s] })
    render(<TrayGame committed={s} />)

    fireEvent.keyDown(document, { key: '1' })
    fireEvent.keyDown(document, { key: '2' })
    fireEvent.keyDown(document, { key: '3' })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(useGameStore.getState().actionLog).toHaveLength(1)
    expect(useGameStore.getState().committed!.phase.kind).toBe('discard')

    fireEvent.keyDown(document, { key: 'u' })

    expect(useGameStore.getState().actionLog).toHaveLength(0)
    expect(useGameStore.getState().committed!.phase.kind).toBe('play')
    expect(useGameStore.getState().committed!.players[0]!.tokens.white).toBe(8)
  })

  it('P 키 → 패스(§9-G PASS-only 상태)', () => {
    // 기존 "합법 행동이 없으면 패스 affordance…" 테스트와 동일한 PASS-only 조립을
    // 키보드 경로로도 검증한다. 전원 교착(allPlayersStuck)이라 PASS 직후 gameOver 로
    // 종료되므로 AI 자동응수 걱정 없이 동기적으로 단언할 수 있다.
    const s = humanVsAi()
    const emptyBoard = s.board.map((row) => row.map(() => null))
    const passState: GameState = {
      ...s,
      supply: tokens(),
      decks: [[], [], []],
      board: emptyBoard,
      nobles: [],
      players: s.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              tokens: tokens(),
              bonuses: gems(),
              reserved: [
                { cardId: 40, fromDeck: false },
                { cardId: 41, fromDeck: false },
                { cardId: 42, fromDeck: false },
              ],
            }
          : p,
      ),
    } as GameState
    useGameStore.setState({ committed: passState })
    render(<TrayGame committed={passState} />)

    fireEvent.keyDown(document, { key: 'p' })

    expect(useGameStore.getState().actionLog).toHaveLength(1)
    expect(useGameStore.getState().actionLog[0]!.type).toBe('PASS')
  })
})
