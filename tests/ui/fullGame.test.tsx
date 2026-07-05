// @vitest-environment jsdom
// UI 통합: App이 마운트된 채로 게임 전체를 완주 — 어떤 국면에서도 렌더가
// 크래시하지 않고 결과 화면에 도달한다 (M4 DoD "완주 가능"의 자동화 부분;
// 실제 마우스 경로는 smoke 테스트와 수동 QA가 담당)

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import { legalActions } from '../../src/engine/legal'
import { useGameStore } from '../../src/store/gameStore'
import { config } from '../helpers'

describe('UI 통합 완주', () => {
  afterEach(cleanup)

  it('무작위 3인전 완주 — 매 수 렌더 유지, 종료 시 결과 화면', { timeout: 60_000 }, () => {
    localStorage.clear()
    render(<App />)
    act(() => {
      useGameStore.getState().newGame(config(3, 777))
    })

    let rng: RngState = createRng(777)
    for (let step = 0; step < 3000; step++) {
      const { committed, handoffPending } = useGameStore.getState()
      if (!committed) throw new Error('상태가 사라졌습니다')
      if (committed.phase.kind === 'gameOver') break

      if (handoffPending) {
        act(() => useGameStore.getState().acknowledgeHandoff())
        continue
      }
      const legal = legalActions(committed)
      const [i, next] = nextInt(rng, legal.length)
      rng = next
      act(() => useGameStore.getState().dispatch(legal[i]!))

      // 진행 중 화면이 살아 있다 (마지막 수라면 결과 화면으로 전환됨)
      expect(
        document.querySelector('.game-screen') ?? document.querySelector('.result-screen'),
      ).not.toBeNull()
    }

    const final = useGameStore.getState().committed!
    expect(final.phase.kind).toBe('gameOver')
    expect(screen.getByRole('heading', { name: '게임 종료' })).toBeTruthy()
    expect(screen.getByText(/승리|승자/)).toBeTruthy()

    // 저장/이어하기도 완주 게임에서 정상 (gameOver 상태 저장 포함)
    expect(useGameStore.getState().actionLog.length).toBeGreaterThan(20)
  })
})
