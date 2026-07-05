import { describe, expect, it } from 'vitest'
import { CARDS } from '../../src/engine/data/cards'
import { NOBLES } from '../../src/engine/data/nobles'
import { fnv1a } from '../../src/engine/serialize'
import { GEM_COLORS, type Card } from '../../src/engine/types'

const byTier = (tier: 1 | 2 | 3): readonly Card[] => CARDS.filter((c) => c.tier === tier)

describe('§1 구성물 — 개발 카드 90장', () => {
  it('총 90장, 티어별 40/30/20장', () => {
    expect(CARDS).toHaveLength(90)
    expect(byTier(1)).toHaveLength(40)
    expect(byTier(2)).toHaveLength(30)
    expect(byTier(3)).toHaveLength(20)
  })

  it('id가 배열 인덱스와 일치한다 (CardId 계약)', () => {
    CARDS.forEach((c, i) => expect(c.id).toBe(i))
  })

  it('보너스 색별 분포: 티어1 8장 / 티어2 6장 / 티어3 4장', () => {
    for (const [tier, expected] of [
      [1, 8],
      [2, 6],
      [3, 4],
    ] as const) {
      for (const color of GEM_COLORS) {
        expect(byTier(tier).filter((c) => c.bonus === color)).toHaveLength(expected)
      }
    }
  })

  it('티어별 점수 범위와 총합 (티어1: 0~1점 합5 / 티어2: 1~3점 합55 / 티어3: 3~5점 합80)', () => {
    const sum = (cards: readonly Card[]) => cards.reduce((s, c) => s + c.points, 0)
    expect(byTier(1).every((c) => c.points >= 0 && c.points <= 1)).toBe(true)
    expect(byTier(2).every((c) => c.points >= 1 && c.points <= 3)).toBe(true)
    expect(byTier(3).every((c) => c.points >= 3 && c.points <= 5)).toBe(true)
    expect(sum(byTier(1))).toBe(5)
    expect(sum(byTier(2))).toBe(55)
    expect(sum(byTier(3))).toBe(80)
  })

  it('중복 카드가 없다', () => {
    const keys = CARDS.map(
      (c) => `${c.tier}|${c.bonus}|${c.points}|${GEM_COLORS.map((g) => c.cost[g]).join(',')}`,
    )
    expect(new Set(keys).size).toBe(90)
  })

  it('티어×색별 비용 총합 고정값 (색 대칭: 티어1 색당 33 / 티어2 41 / 티어3 43)', () => {
    // 스냅샷 해시와 독립적인 2차 방어선 — 단일 비용 오타를 해시 갱신 관행과 무관하게 잡는다
    for (const [tier, expected] of [
      [1, 33],
      [2, 41],
      [3, 43],
    ] as const) {
      for (const color of GEM_COLORS) {
        const sum = byTier(tier).reduce((s, c) => s + c.cost[color], 0)
        expect(sum, `tier ${tier} ${color} cost sum`).toBe(expected)
      }
    }
  })

  it('비용은 전부 0~7 범위의 정수', () => {
    for (const c of CARDS) {
      for (const g of GEM_COLORS) {
        const v = c.cost[g]
        expect(Number.isInteger(v) && v >= 0 && v <= 7).toBe(true)
      }
    }
  })
})

describe('§1 구성물 — 귀족 타일 10장', () => {
  it('총 10장, 전원 3점', () => {
    expect(NOBLES).toHaveLength(10)
    expect(NOBLES.every((n) => n.points === 3)).toBe(true)
  })

  it('id가 배열 인덱스와 일치한다 (NobleId 계약)', () => {
    NOBLES.forEach((n, i) => expect(n.id).toBe(i))
  })

  it('요구 조건은 두 색 4+4 또는 세 색 3+3+3 패턴이며 중복이 없다', () => {
    const patterns = NOBLES.map((n) =>
      GEM_COLORS.map((g) => n.requirement[g])
        .filter((v) => v > 0)
        .sort()
        .join('+'),
    )
    for (const p of patterns) {
      expect(['4+4', '3+3+3']).toContain(p)
    }
    const keys = NOBLES.map((n) => GEM_COLORS.map((g) => n.requirement[g]).join(','))
    expect(new Set(keys).size).toBe(10)
  })
})

describe('원본(data/cards.json) ↔ 생성물(cards.ts) 드리프트 검출', () => {
  interface RawCard {
    tier: number
    bonus: string
    points: number
    cost: Record<string, number>
  }
  interface RawNoble {
    points: number
    requirement: Record<string, number>
  }

  it('생성된 CARDS/NOBLES가 원본 JSON과 집합으로 동일하다 (재생성 누락 검출)', async () => {
    const { readFileSync } = await import('node:fs')
    const raw = JSON.parse(
      readFileSync(new URL('../../data/cards.json', import.meta.url), 'utf8'),
    ) as { cards: RawCard[]; nobles: RawNoble[] }

    const cardKey = (c: RawCard) =>
      `${c.tier}|${c.bonus}|${c.points}|${GEM_COLORS.map((g) => c.cost[g]).join(',')}`
    const nobleKey = (n: RawNoble) =>
      `${n.points}|${GEM_COLORS.map((g) => n.requirement[g]).join(',')}`

    expect(new Set(CARDS.map(cardKey))).toEqual(new Set(raw.cards.map(cardKey)))
    expect(new Set(NOBLES.map(nobleKey))).toEqual(new Set(raw.nobles.map(nobleKey)))
  })
})

describe('데이터 변조 검출 지문', () => {
  it('카드+귀족 데이터의 스냅샷 해시가 고정값과 일치한다', () => {
    const fingerprint = fnv1a(JSON.stringify({ cards: CARDS, nobles: NOBLES }))
    // 임의의 카드 1장이라도 바뀌면 이 테스트가 실패한다.
    // 데이터를 의도적으로 수정했다면 docs/RULES.md 근거와 함께 이 값을 갱신할 것.
    expect(fingerprint).toBe('968e9cb9')
  })
})
