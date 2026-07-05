// @vitest-environment jsdom
// M5 DoD: AI 게임이 개입 없이 정상 완주 + undo 정합 프로퍼티

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAiDelayScale } from '../../src/ai/client'
import { hashState, replay } from '../../src/engine/serialize'
import { legalActions } from '../../src/engine/legal'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import type { GameConfig } from '../../src/engine/types'
import { useGameStore } from '../../src/store/gameStore'

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

const store = () => useGameStore.getState()

const aiConfig = (seed: number): GameConfig => ({
  players: [
    { type: 'ai', name: 'AI 쉬움', difficulty: 'easy' },
    { type: 'ai', name: 'AI 보통', difficulty: 'normal' },
    { type: 'ai', name: 'AI 쉬움 2', difficulty: 'easy' },
  ],
  seed,
})

describe('AI 통합', () => {
  beforeEach(resetStore)

  it('AI 3명 게임이 개입 없이 완주된다 (쉬움/보통 혼합)', { timeout: 120_000 }, async () => {
    store().newGame(aiConfig(1234))
    await vi.waitFor(
      () => {
        expect(store().committed!.phase.kind).toBe('gameOver')
      },
      { timeout: 110_000, interval: 200 },
    )
    expect(store().actionLog.length).toBeGreaterThan(20)
    // 완주 후에도 진실원 불변식 유지
    expect(hashState(replay(store().committed!.config, store().actionLog))).toBe(
      hashState(store().committed!),
    )
  })

  it('사람 1 + AI 게임에서 undo가 내 직전 결정 시점까지 롤백한다 (프로퍼티)', { timeout: 120_000 }, async () => {
    const config: GameConfig = {
      players: [
        { type: 'human', name: '사람' },
        { type: 'ai', name: 'AI', difficulty: 'easy' },
      ],
      seed: 777,
    }
    store().newGame(config)
    let rng: RngState = createRng(42)

    for (let round = 0; round < 8; round++) {
      // 사람 차례가 될 때까지 대기 (AI 자동 진행)
      await vi.waitFor(
        () => {
          const s = store().committed!
          expect(
            s.phase.kind === 'gameOver' ||
              (!store().aiThinking && s.config.players[s.currentPlayer]!.type === 'human'),
          ).toBe(true)
        },
        { timeout: 20_000, interval: 50 },
      )
      const s = store().committed!
      if (s.phase.kind === 'gameOver') break

      // 사람이 무작위 합법 수를 둔다
      const legal = legalActions(s)
      const [i, next] = nextInt(rng, legal.length)
      rng = next
      store().dispatch(legal[i]!)

      // 짝수 라운드마다 undo — 진실원 불변식과 롤백 지점 검증
      if (round % 2 === 0) {
        await vi.waitFor(
          () => {
            expect(store().aiThinking).toBe(false)
          },
          { timeout: 20_000, interval: 50 },
        )
        const before = store().actionLog.length
        store().undo()
        const after = store()
        expect(after.actionLog.length).toBeLessThan(before)
        // 롤백 지점은 사람 결정 시점 (또는 게임 시작)
        const cur = after.committed!
        expect(
          after.actionLog.length === 0 ||
            cur.config.players[cur.currentPlayer]!.type === 'human',
        ).toBe(true)
        // committed === replay(config, actionLog) 불변식
        expect(hashState(replay(cur.config, after.actionLog))).toBe(hashState(cur))
        // eventFeed 절단 정합
        expect(after.eventCounts.length).toBe(after.actionLog.length)
        expect(after.eventFeed.length).toBe(after.eventCounts.reduce((a, b) => a + b, 0))
      }
    }
  })

  it('AI가 discard/chooseNoble phase도 정책으로 스스로 해소한다 (2 AI 완주 재확인)', { timeout: 60_000 }, async () => {
    store().newGame({
      players: [
        { type: 'ai', name: 'A', difficulty: 'easy' },
        { type: 'ai', name: 'B', difficulty: 'easy' },
      ],
      seed: 5150,
    })
    await vi.waitFor(
      () => {
        expect(store().committed!.phase.kind).toBe('gameOver')
      },
      { timeout: 55_000, interval: 100 },
    )
  })
})
