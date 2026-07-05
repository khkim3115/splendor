import { describe, expect, it } from 'vitest'
import { hashState } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import { CARDS } from '../../src/engine/data/cards'
import {
  GEM_COLORS,
  type GameConfig,
  type PlayerKind,
} from '../../src/engine/types'

const humans = (n: number): PlayerKind[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'human', name: `P${i + 1}` }))

const config = (n: number, seed = 1): GameConfig => ({ players: humans(n), seed })

describe('§2 게임 셋업', () => {
  it('§2: 인원수별 보석 토큰 수 (2인 4개 / 3인 5개 / 4인 7개), 황금은 항상 5개', () => {
    for (const [n, gems] of [
      [2, 4],
      [3, 5],
      [4, 7],
    ] as const) {
      const s = setupGame(config(n))
      for (const g of GEM_COLORS) {
        expect(s.supply[g]).toBe(gems)
      }
      expect(s.supply.gold).toBe(5)
    }
  })

  it('§2-3: 공개 귀족 타일은 인원+1장', () => {
    expect(setupGame(config(2)).nobles).toHaveLength(3)
    expect(setupGame(config(3)).nobles).toHaveLength(4)
    expect(setupGame(config(4)).nobles).toHaveLength(5)
  })

  it('§2-3: 공개 귀족은 중복 없이 유효한 id(0..9)로 구성된다', () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      const s = setupGame(config(4, seed))
      expect(new Set(s.nobles).size).toBe(s.nobles.length)
      expect(s.nobles.every((id) => Number.isInteger(id) && id >= 0 && id <= 9)).toBe(true)
    }
  })

  it('§2 [구현 결정]: 선 플레이어 추첨이 시드에 따라 실제로 달라진다', () => {
    const starts = new Set<number>()
    for (let seed = 0; seed < 20; seed++) {
      starts.add(setupGame(config(4, seed)).startPlayer)
    }
    // 추첨 코드를 상수로 바꾸는 회귀를 잡는다 (20개 시드가 전부 같은 값일 확률 ≈ 4^-19)
    expect(starts.size).toBeGreaterThan(1)
  })

  it('§2-2: 티어별 4장 공개, 남은 덱은 36/26/16장, 카드 90장 분할 보존', () => {
    const s = setupGame(config(4))
    expect(s.board).toHaveLength(3)
    for (const row of s.board) {
      expect(row).toHaveLength(4)
      expect(row.every((c) => c !== null)).toBe(true)
    }
    expect(s.decks[0]).toHaveLength(36)
    expect(s.decks[1]).toHaveLength(26)
    expect(s.decks[2]).toHaveLength(16)

    const all = [...s.decks.flat(), ...s.board.flat()].filter((c) => c !== null)
    expect(new Set(all).size).toBe(90)
  })

  it('§2-1: 덱과 공개 카드는 자기 티어의 카드로만 구성된다', () => {
    const s = setupGame(config(3))
    for (const tier of [1, 2, 3] as const) {
      const deck = s.decks[tier - 1]
      const row = s.board[tier - 1]
      expect(deck).toBeDefined()
      expect(row).toBeDefined()
      for (const id of [...deck!, ...row!]) {
        expect(CARDS[id as number]!.tier).toBe(tier)
      }
    }
  })

  it('플레이어는 빈 상태로 시작하고, 선 플레이어부터 play phase로 시작한다', () => {
    const s = setupGame(config(3))
    for (const p of s.players) {
      expect(Object.values(p.tokens).every((v) => v === 0)).toBe(true)
      expect(p.purchased).toHaveLength(0)
      expect(p.reserved).toHaveLength(0)
      expect(p.nobles).toHaveLength(0)
      expect(p.prestige).toBe(0)
    }
    expect(s.phase).toEqual({ kind: 'play' })
    expect(s.currentPlayer).toBe(s.startPlayer)
    expect(s.startPlayer).toBeGreaterThanOrEqual(0)
    expect(s.startPlayer).toBeLessThan(3)
    expect(s.finalRound).toBe(false)
    expect(s.turn).toBe(0)
  })

  it('같은 config면 hashState가 동일하고, 시드가 다르면 배치가 달라진다', () => {
    expect(hashState(setupGame(config(4, 7)))).toBe(hashState(setupGame(config(4, 7))))
    expect(hashState(setupGame(config(4, 7)))).not.toBe(hashState(setupGame(config(4, 8))))
  })

  it('호출자 config 객체의 키 순서가 달라도 hashState가 동일하다 (config 정규화)', () => {
    const a: GameConfig = { players: humans(3), seed: 7 }
    const b = JSON.parse('{"seed":7,"players":[]}') as { seed: number; players: PlayerKind[] }
    b.players = humans(3)
    expect(hashState(setupGame(a))).toBe(hashState(setupGame(b as GameConfig)))
  })

  it('플레이어 수 2~4 외는 거부한다', () => {
    expect(() => setupGame(config(1))).toThrow()
    expect(() => setupGame(config(5))).toThrow()
  })
})
