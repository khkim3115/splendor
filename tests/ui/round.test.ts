import { describe, expect, it } from 'vitest'
import { roundNumber } from '../../src/ui/round'
import { baseState } from '../helpers'

// roundNumber는 turn·플레이어 수만 사용 → jsdom 불필요(순수 함수).
describe('roundNumber — turn·플레이어 수 파생', () => {
  for (const n of [2, 3, 4]) {
    it(`${n}인전: turn 0 → 1라운드`, () => {
      expect(roundNumber(baseState(n, 1, { turn: 0 }))).toBe(1)
    })
    it(`${n}인전: turn ${n - 1} → 1라운드 (라운드 마지막 수)`, () => {
      expect(roundNumber(baseState(n, 1, { turn: n - 1 }))).toBe(1)
    })
    it(`${n}인전: turn ${n} → 2라운드 (다음 라운드 첫 수)`, () => {
      expect(roundNumber(baseState(n, 1, { turn: n }))).toBe(2)
    })
    it(`${n}인전: turn ${2 * n} → 3라운드`, () => {
      expect(roundNumber(baseState(n, 1, { turn: 2 * n }))).toBe(3)
    })
  }

  it('finalRound 여부는 라운드 숫자에 영향 없음', () => {
    expect(roundNumber(baseState(2, 1, { turn: 6, finalRound: true }))).toBe(4)
  })
})
