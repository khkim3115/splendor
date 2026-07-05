// 적대적 테스트 — 토큰 획득 (RULES.md §4.1, §4.2, §9-A/B/C/F)
// 기대값은 전부 docs/RULES.md에서 도출했다. 엔진 동작 역산 금지.
//
// 공격 각도:
//  - 기묘하게 고갈된 공급처 분포(0/1/3/4 혼합)에서의 엄격 해석 경계
//  - 남은 색 수가 정확히 3/2/1/0일 때 "정확히 min(3, 남은 색 수)개" 강제
//  - 행동 B의 "4개 이상" 정확한 경계(5→3 붕괴 포함)
//  - 황금 혼입 시도(황금만 남음 / 황금으로 색 수 채우기 / 중복 황금)
//  - 연속 획득으로 공급처를 실제로 완전히 말리는 마라톤 + 토큰 보존 검증

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { tokenTotal } from '../../src/engine/tokens'
import { GEM_COLORS, type GemColor } from '../../src/engine/types'
import { baseState, patchPlayer, tokens } from '../helpers'

/** 불법 액션이 던진 IllegalActionError의 근거 조항을 얻는다 */
const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다 — 룰 위반이 통과됨')
}

/** 룰 근거가 복수 조항으로 해석 가능한 경우: 허용 집합 중 하나여야 한다 */
const expectRuleIn = (fn: () => unknown, accepted: readonly string[]): void => {
  expect(accepted).toContain(ruleOf(fn))
}

describe('§4.1 — 기묘하게 고갈된 분포(0/1/3/4)에서의 행동 A', () => {
  // 공급처: white 0, blue 1, green 3, red 4, black 0 → 서로 다른 색 정확히 3색
  const weird = () => baseState(2, 1, { supply: tokens({ blue: 1, green: 3, red: 4, gold: 2 }) })

  it('§4.1+§9-B: 3색이 남아 있으면 정확히 3개를 가져와야 한다 — 2개 요청은 거부', () => {
    // RULES §4.1 [구현 결정]: min(남은 서로 다른 색 수, 3)개 강제 (엄격 해석)
    const s = weird()
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['blue', 'green'] })),
    ).toBe('§4.1')
  })

  it('§4.1: 고갈된 색(0개)을 3색 구성에 끼워넣으면 거부된다', () => {
    // white는 0개 — 없는 토큰은 가져올 수 없다
    const s = weird()
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] }),
      ),
    ).toBe('§4.1')
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['black', 'green', 'red'] }),
      ),
    ).toBe('§4.1')
  })

  it('§4.1: 남은 3색을 정확히 가져오면 색별로 정확히 1개씩만 차감된다 (blue는 0으로)', () => {
    const s = weird()
    const { state } = applyAction(s, {
      type: 'TAKE_DIFFERENT',
      colors: ['blue', 'green', 'red'],
    })
    // 마지막 blue 1개를 행동 A로 가져가는 것은 합법 (§9-B: 마지막 3개 이하는 행동 A로만)
    expect(state.supply).toEqual(tokens({ blue: 0, green: 2, red: 3, gold: 2 }))
    expect(state.players[0]!.tokens).toEqual(tokens({ blue: 1, green: 1, red: 1 }))
    expect(state.players[1]!.tokens).toEqual(tokens()) // 다른 플레이어는 무변
    expect(state.currentPlayer).toBe(1)
  })
})

describe('§4.1 — 개수 조작 공격', () => {
  it('§4.1: 3색 이상 남았을 때 4개/5개를 가져가려는 탐욕은 거부된다', () => {
    // RULES §4.1: 행동 A는 서로 다른 색 "3개" — 그 이상은 어떤 경우에도 불가
    const s = baseState(2) // 5색 모두 4개
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green', 'red'] }),
      ),
    ).toBe('§4.1')
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'TAKE_DIFFERENT',
          colors: ['white', 'blue', 'green', 'red', 'black'],
        }),
      ),
    ).toBe('§4.1')
  })

  it('§9-A: 공급처가 풍부해도 0개 획득은 행동으로 성립하지 않는다', () => {
    // RULES §9-A: "0개 획득은 행동으로 성립하지 않는다"
    const s = baseState(2)
    expectRuleIn(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: [] }), ['§9-A', '§4.1'])
  })

  it('§4.1: 2색만 남았을 때 같은 색 중복으로 개수(2개)를 맞추는 우회는 거부된다', () => {
    // 남은 색 2 → 요구 개수 2. 하지만 행동 A는 "서로 다른 색"이어야 한다
    const s = baseState(2, 1, { supply: tokens({ red: 5, blue: 2, gold: 5 }) })
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'red'] }))).toBe(
      '§4.1',
    )
    // 올바른 2색 구성은 통과
    const { state } = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue'] })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 1, blue: 1 }))
  })
})

describe('§4.2/§9-C — 행동 B "4개 이상" 정확한 경계', () => {
  it('§4.2+§9-C: 0/1/3/4 분포 경계 스윕 — 4개만 허용, 3/1/0개는 전부 거부', () => {
    // RULES §4.2: "가져오는 시점에 4개 이상 남아 있어야" — 정확히 4개는 가능, 3개 이하 불가
    const s = baseState(2, 1, { supply: tokens({ blue: 1, green: 3, red: 4, gold: 2 }) })
    const { state } = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 2 }))
    expect(state.supply.red).toBe(2)

    for (const c of ['green', 'blue', 'white'] as const) {
      expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: c }))).toBe('§4.2')
    }
  })

  it('§4.2: 5개→3개 붕괴 — 한 번 가져가면 다음 플레이어는 같은 색 행동 B 불가, 실패는 상태를 못 바꾼다', () => {
    let s = baseState(3) // 3인전: 각 보석 색 5개 (RULES §2)
    s = applyAction(s, { type: 'TAKE_SAME', color: 'red' }).state
    expect(s.supply.red).toBe(3)

    const snapshot = JSON.stringify(s)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4.2')
    expect(JSON.stringify(s)).toBe(snapshot) // 거부된 공격이 상태를 오염시키면 안 된다

    // 같은 상태에서 남은 red 3개는 행동 A로는 여전히 접근 가능 (§9-B)
    const next = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue', 'green'] })
    expect(next.state.supply.red).toBe(2)
  })
})

describe('§9-F — 황금 혼입 시도', () => {
  it('§9-F: 황금만 남은 공급처 — 행동 A로도 행동 B(5개≥4 함정)로도 황금은 불가', () => {
    // RULES §9-F: 예약이 황금을 얻는 유일한 방법. §9-A: 보석이 0이면 행동 A 자체 불가
    const s = baseState(2, 1, { supply: tokens({ gold: 5 }) })
    expectRuleIn(
      () =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['gold'] as unknown as GemColor[] }),
      ['§9-F', '§9-A', '§4.1'],
    )
    // gold는 5개 ≥ 4개 — 수량 조건만 보면 통과하는 함정. 그래도 §9-F로 막혀야 한다
    expectRuleIn(
      () => applyAction(s, { type: 'TAKE_SAME', color: 'gold' as unknown as GemColor }),
      ['§9-F', '§4.2'],
    )
  })

  it('§9-F: 보석 1색 + 황금으로 "2색"을 채우려는 시도는 거부된다', () => {
    // 남은 보석 색은 red 하나뿐 → 행동 A 요구 개수는 1. 황금은 색 수에 낄 수 없다
    const s = baseState(2, 1, { supply: tokens({ red: 2, gold: 5 }) })
    expectRuleIn(
      () =>
        applyAction(s, {
          type: 'TAKE_DIFFERENT',
          colors: ['red', 'gold'] as unknown as GemColor[],
        }),
      ['§9-F', '§4.1'],
    )
  })

  it('§9-F: 황금 2개+보석 1개로 3개 구성을 위장해도 거부된다', () => {
    const s = baseState(2)
    expectRuleIn(
      () =>
        applyAction(s, {
          type: 'TAKE_DIFFERENT',
          colors: ['gold', 'gold', 'red'] as unknown as GemColor[],
        }),
      ['§4.1', '§9-F'],
    )
  })

  it('런타임 방어: 존재하지 않는 색은 어떤 행동으로도 가져올 수 없다', () => {
    // RULES §1: 보석은 5색뿐. 그 밖의 값은 불법 액션이어야 한다
    const s = baseState(2)
    expect(() =>
      applyAction(s, { type: 'TAKE_SAME', color: 'purple' as unknown as GemColor }),
    ).toThrow(IllegalActionError)
    expect(() =>
      applyAction(s, {
        type: 'TAKE_DIFFERENT',
        colors: ['purple', 'red', 'blue'] as unknown as GemColor[],
      }),
    ).toThrow(IllegalActionError)
  })
})

describe('§9-A/B — 극단 고갈 상태', () => {
  it('§9-A: 보석 0 + 황금만 있음 — 행동 A는 어떤 형태로도 불가', () => {
    // RULES §9-A: "보석 토큰이 하나도 없으면 행동 A 자체가 불가"
    const s = baseState(2, 1, { supply: tokens({ gold: 3 }) })
    expectRuleIn(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red'] }), [
      '§4.1',
      '§9-A',
    ])
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: [] }))).toBe('§9-A')
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4.2')
  })

  it('§9-B: 1색만 남았어도 4개 이상이면 행동 A(1개)와 행동 B(2개) 모두 가능', () => {
    // RULES §9-B: "그중 어떤 색이 4개 이상 남아 있으면 행동 B도 여전히 가능하다"
    const s = baseState(2, 1, { supply: tokens({ green: 6, gold: 1 }) })

    const viaA = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['green'] })
    expect(viaA.state.players[0]!.tokens).toEqual(tokens({ green: 1 }))
    expect(viaA.state.supply.green).toBe(5)

    const viaB = applyAction(s, { type: 'TAKE_SAME', color: 'green' })
    expect(viaB.state.players[0]!.tokens).toEqual(tokens({ green: 2 }))
    expect(viaB.state.supply.green).toBe(4)

    // 행동 A로 같은 색 2개(중복)는 여전히 불가
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['green', 'green'] })),
    ).toBe('§4.1')
  })

  it('§9-G+§5: 토큰 10개 소지 중에도 마지막 1색 1개를 가져올 수 있고, 방금 받은 것을 그대로 반납할 수 있다', () => {
    // RULES §9-G: "토큰이 10개여도 행동 A/B는 가능하다(가져온 뒤 10개까지 반납)"
    let s = baseState(2, 1, { supply: tokens({ green: 1, gold: 2 }) })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 5 }) }) // 정확히 10개

    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['green'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    expect(mid.state.supply.green).toBe(0)

    // §5: 방금 가져온 토큰을 그대로 반납해도 된다
    const after = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ green: 1 }) })
    expect(after.state.supply.green).toBe(1) // 공급처로 복귀
    expect(tokenTotal(after.state.players[0]!.tokens)).toBe(10)
    expect(after.state.currentPlayer).toBe(1)
    expect(after.state.phase).toEqual({ kind: 'play' })
  })
})

describe('§4.1+§4.2+§9-A/B/C — 연속 획득으로 공급처 완전 고갈 마라톤 (2인전)', () => {
  it('경계가 4→3→2→1→0으로 무너지는 동안 매 시점의 합법/불법이 룰과 일치한다', () => {
    let s = baseState(2) // 각 보석 4개, 황금 5개 (RULES §2)

    // [P0] 행동 B: white 4→2 (정확히 4개 남은 경우 허용, §4.2)
    s = applyAction(s, { type: 'TAKE_SAME', color: 'white' }).state
    expect(s.supply.white).toBe(2)
    expect(s.currentPlayer).toBe(1)

    // [P1] 2개 남은 white에 행동 B → 불가 (§4.2)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'white' }))).toBe('§4.2')
    // [P1] 행동 A → w1 b3 g3 r4 k4
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] }).state

    // [P0] 3개 남은 blue에 행동 B → 불가 (§9-C: 3개 남은 더미에서 2개 금지)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'blue' }))).toBe('§4.2')
    // [P0] 행동 A → w0 b2 g2 r4 k4
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] }).state
    expect(s.supply.white).toBe(0)

    // [P1] 이제 white는 0 — 끼워넣기 불가 (§4.1)
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] }),
      ),
    ).toBe('§4.1')
    // [P1] 아직 4색 남음 → 2개만 가져오기 불가 (§4.1 엄격 해석)
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['blue', 'green'] })),
    ).toBe('§4.1')
    // [P1] 행동 A → b1 g1 r3 k4
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['blue', 'green', 'red'] }).state

    // [P0] 3개 남은 red에 행동 B → 불가 (§4.2)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4.2')
    // [P0] 행동 A → b0 g0 r2 k4 — 남은 색은 red/black 2색
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['blue', 'green', 'red'] }).state

    // [P1] 2색 남음 → 1개만 가져오기 불가 (§9-B: 2색이면 2개), 고갈 색 포함 불가
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red'] }))).toBe('§4.1')
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'black', 'blue'] }),
      ),
    ).toBe('§4.1')
    // [P1] §9-B: 2색만 남아도 black은 4개 → 행동 B 여전히 가능 → k2
    s = applyAction(s, { type: 'TAKE_SAME', color: 'black' }).state
    expect(s.supply.black).toBe(2)

    // [P0] 이제 행동 B는 전멸 (red 2, black 2)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4.2')
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'black' }))).toBe('§4.2')
    // [P0] 행동 A 2색 → r1 k1 — P0 정확히 10개, 반납 없이 턴 종료 (§5)
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'black'] }).state
    expect(tokenTotal(s.players[0]!.tokens)).toBe(10)
    expect(s.phase).toEqual({ kind: 'play' })
    expect(s.currentPlayer).toBe(1)

    // [P1] 마지막 2개 흡수 → 보석 공급처 완전 고갈
    s = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'black'] }).state
    expect(GEM_COLORS.every((c) => s.supply[c] === 0)).toBe(true)

    // [P0] 보석 0 → 행동 A/B 전부 불가 (§9-A)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red'] }))).toBe('§4.1')
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: [] }))).toBe('§9-A')
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'black' }))).toBe('§4.2')

    // §9-F: 전 과정에서 황금은 단 1개도 새지 않았다
    expect(s.supply.gold).toBe(5)
    // 토큰 보존 법칙: 보석 4×5 + 황금 5 = 25개가 어디로도 증발/증식하지 않았다
    const total =
      tokenTotal(s.supply) +
      tokenTotal(s.players[0]!.tokens) +
      tokenTotal(s.players[1]!.tokens)
    expect(total).toBe(25)
    expect(tokenTotal(s.players[0]!.tokens)).toBe(10)
    expect(tokenTotal(s.players[1]!.tokens)).toBe(10)
  })
})
