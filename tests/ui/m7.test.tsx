// @vitest-environment jsdom
// M7 — 연출·접근성·모바일 (docs/ROADMAP.md M7). 룰은 엔진에 있으므로 여기서는
// "reduced-motion이면 연출 전무", "연출 중에도 표시=committed", 포커스 순회,
// 도형 이중 부호화만 검증한다. 엔진·스토어는 무변경이다.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { setAiDelayScale } from '../../src/ai/client'
import { TOKEN_COLORS } from '../../src/engine'
import { useGameStore } from '../../src/store/gameStore'
import { GEM_SHAPE } from '../../src/ui/components/common/GemIcon'
import { prefersReducedMotion } from '../../src/ui/hooks/useReducedMotion'
import { baseState, config } from '../helpers'

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

async function takeThreeDifferent(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByLabelText(/^루비 토큰/))
  await user.click(screen.getByLabelText(/^에메랄드 토큰/))
  await user.click(screen.getByLabelText(/^사파이어 토큰/))
  await user.click(screen.getByRole('button', { name: '가져오기 확정' }))
}

describe('M7 — reduced-motion (matchMedia 없음 = 무연출 경로)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('prefersReducedMotion(): matchMedia가 없으면 reduce로 취급한다', () => {
    // jsdom 기본값 — 이것이 기존 UI 테스트가 무연출 경로를 타는 이유다
    expect(prefersReducedMotion()).toBe(true)
  })

  it('연출 레이어는 존재하되, 토큰을 집어도 나는 보석 칩이 하나도 생기지 않는다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)
    await takeThreeDifferent(user)

    expect(document.querySelector('.fly-layer')).not.toBeNull()
    expect(document.querySelectorAll('.fly-gem')).toHaveLength(0)
  })
})

describe('M7 — 연출 활성(matchMedia matches:false + animate 스텁)', () => {
  const proto = HTMLElement.prototype as unknown as { animate?: unknown }
  const origAnimate = proto.animate
  let animateMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetStore()
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (q) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false
        },
      }) as unknown as MediaQueryList
    // jsdom엔 Element.animate가 없다 — 스텁으로 연출 경로를 관측 가능하게 만든다
    animateMock = vi.fn(() => ({ onfinish: null, oncancel: null }) as unknown as Animation)
    proto.animate = animateMock
  })

  afterEach(() => {
    cleanup()
    proto.animate = origAnimate
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('토큰 이동 연출이 실제로 재생된다 (나는 칩 생성 + animate 호출)', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)
    await takeThreeDifferent(user)

    // 서로 다른 3색 = 3개의 나는 칩
    expect(document.querySelectorAll('.fly-gem').length).toBe(3)
    expect(animateMock).toHaveBeenCalled()
  })

  it('연출 재생 중에도 공급처 표시가 committed와 정확히 일치한다 (DoD)', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)
    await takeThreeDifferent(user)

    // 칩이 떠 있는 상태(스텁이라 onfinish 미발생 → 칩 잔존)에서도…
    expect(document.querySelectorAll('.fly-gem').length).toBeGreaterThan(0)
    // …공급처 DOM 카운트는 committed.supply와 바이트 단위로 같다
    const committed = useGameStore.getState().committed!
    for (const color of ['red', 'green', 'blue'] as const) {
      const pile = screen.getByLabelText(new RegExp(`^${labelKo(color)} 토큰 ${committed.supply[color]}개`))
      expect(pile).toBeTruthy()
    }
  })
})

describe('M7 — 접근성', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('반납 모달이 열리면 포커스가 모달 안으로 이동한다 (키보드 포커스 순회)', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    // 10개 초과를 만들어 반납 phase 유도
    const s = useGameStore.getState().committed!
    useGameStore.setState({
      committed: {
        ...s,
        players: s.players.map((p, i) =>
          i === s.currentPlayer
            ? { ...p, tokens: { ...p.tokens, white: 4, blue: 4 } }
            : p,
        ),
      },
    })
    render(<App />)
    await takeThreeDifferent(user)

    const dialog = screen.getByRole('dialog', { name: '토큰 반납' })
    const modal = dialog.querySelector('.modal')!
    // 열리자마자 포커스가 모달 내부의 조작 요소로 이동해 있어야 한다
    expect(modal.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('6색 토큰이 서로 다른 도형으로 이중 부호화된다 (색각 이상 대비)', () => {
    // 색상값이 아니라 도형(polygon points)만으로 6색이 구별된다
    const shapes = TOKEN_COLORS.map((c) => GEM_SHAPE[c])
    expect(new Set(shapes).size).toBe(TOKEN_COLORS.length)
    expect(TOKEN_COLORS).toHaveLength(6)
  })

  it('낭독 영역이 role=status·aria-atomic으로 직전 행동 전체를 전한다', async () => {
    const user = userEvent.setup()
    useGameStore.getState().newGame(config(2, 42))
    render(<App />)
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByLabelText(/^루비 토큰/))
    await user.click(screen.getByRole('button', { name: '가져오기 확정' }))

    const live = document.querySelector('[aria-live="polite"][aria-atomic="true"]')!
    expect(live).not.toBeNull()
    expect(live.getAttribute('role')).toBe('status')
    expect(live.textContent).toContain('획득')
  })
})

describe('M7 — AI 사고 인디케이터', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('AI 차례에 사고 중이면 배너와 보드에 인디케이터가 표시된다', () => {
    const s = baseState(2, 42, { currentPlayer: 1 })
    useGameStore.setState({
      committed: {
        ...s,
        config: {
          ...s.config,
          players: [
            { type: 'human', name: '사람' },
            { type: 'ai', name: 'AI 보통', difficulty: 'normal' },
          ] as const,
        },
      },
      aiThinking: true,
      handoffPending: false,
    })
    render(<App />)

    expect(screen.getByText('생각 중')).toBeTruthy()
    expect(document.querySelector('.thinking-dots')).not.toBeNull()
    // 보드 위 오버레이 — 지금 누가 두는 중인지 알린다
    expect(screen.getByText(/수를 두는 중/)).toBeTruthy()
  })
})

// 라벨 매칭용 색→한글 (i18n COLOR_KO의 서브셋)
function labelKo(color: 'red' | 'green' | 'blue'): string {
  return { red: '루비', green: '에메랄드', blue: '사파이어' }[color]
}
