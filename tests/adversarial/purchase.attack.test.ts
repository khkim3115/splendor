// 적대적 테스트 — 구매와 지불 (docs/RULES.md §4.4, §4.4.1, §5.1, §9-L/M/N)
// 기대값은 전부 RULES.md에서 도출했다. 엔진 동작을 보고 역산하지 않는다.
//
// 공격 각도:
//  1) 황금 배분 조합 공격: 여러 색 동시 부족 + 배분 자유(§9-L) + 총액 등식(§4.4.1-4)
//  2) 보너스가 비용을 정확히/초과 커버하는 경계(§4.4.1-5/-6)
//  3) 예약 카드 구매 시 보드·덱 완전 무변화(§4.4, §7)
//  4) 지불 후 공급처 정합 — 색별 보존 불변식(§9-M)
//  5) 구매로 보너스가 늘어 같은 턴 귀족 조건이 새로 충족(§6, §9-J, §9-N)
//  6) canonicalPayment/isValidPayment 계약 — 황금 최소 사용(§4.4.1-4) 전수 열거 검증

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { CARDS } from '../../src/engine/data/cards'
import { NOBLES } from '../../src/engine/data/nobles'
import { IllegalActionError } from '../../src/engine/errors'
import { canAfford, canonicalPayment, isValidPayment } from '../../src/engine/payment'
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type Card,
  type GameState,
  type GemColor,
  type PlayerState,
  type TokenColor,
} from '../../src/engine/types'
import { baseState, findCard, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

/** 불법 액션의 근거 §번호를 뽑는다 (throw가 없으면 실패) */
const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다 — 엔진이 불법 지불을 수락함')
}

/** 카드 비용이 정확히 주어진 조합인지 (명시 안 한 색은 0) */
const costIs = (c: Card, cost: Partial<Record<GemColor, number>>): boolean =>
  GEM_COLORS.every((g) => c.cost[g] === (cost[g] ?? 0))

/** 색별 전체 토큰 총량 (공급처 + 전 플레이어) — §9-M 보존 불변식 검증용 */
const colorTotal = (s: GameState, c: TokenColor): number =>
  s.supply[c] + s.players.reduce((acc, p) => acc + p.tokens[c], 0)

/** 순수 지불 함수 검증용 최소 플레이어 */
const mkPlayer = (
  t: Parameters<typeof tokens>[0] = {},
  b: Parameters<typeof gems>[0] = {},
): PlayerState => ({
  tokens: tokens(t),
  purchased: [],
  reserved: [],
  nobles: [],
  bonuses: gems(b),
  prestige: 0,
})

// ── 공격에 쓰는 실제 카드 (data/cards.ts) ──────────────────────────────
const FOUR_ONES = findCard((c) => c.tier === 1 && costIs(c, { blue: 1, green: 1, red: 1, black: 1 })) // id 1
const B2K2 = findCard((c) => c.tier === 1 && costIs(c, { blue: 2, black: 2 })) // id 3
const B3 = findCard((c) => c.tier === 1 && costIs(c, { blue: 3 })) // id 5, 보너스 white
const R3_GREEN = findCard((c) => c.tier === 1 && c.bonus === 'green' && costIs(c, { red: 3 })) // id 16
const W3_RED = findCard((c) => c.tier === 1 && c.bonus === 'red' && costIs(c, { white: 3 })) // id 30
const MIX = findCard((c) => c.tier === 1 && c.bonus === 'green' && costIs(c, { blue: 1, red: 2, black: 2 })) // id 17

describe('§4.4.1/§9-L 황금 배분 조합 공격', () => {
  it('§4.4.1-3/-4: 4색 동시 부족을 황금 4개만으로 전액 충당 (Σshort == gold 경계)', () => {
    // 비용 {blue1, green1, red1, black1}, 보석 0개 + 황금 4개 → Σshort = 4 = gold, 정확히 경계
    let s = placeOnBoard(baseState(2), FOUR_ONES.id)
    s = patchPlayer(s, 0, { tokens: tokens({ gold: 4 }) })
    const supplyBefore = s.supply

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: FOUR_ONES.id,
      payment: tokens({ gold: 4 }),
    })
    const p = state.players[0]!
    expect(p.tokens).toEqual(tokens()) // 전부 지불
    expect(p.purchased).toContain(FOUR_ONES.id)
    // §9-M: 황금 4개만 공급처로, 보석 더미는 무변화
    expect(state.supply.gold).toBe(supplyBefore.gold + 4)
    for (const g of GEM_COLORS) expect(state.supply[g]).toBe(supplyBefore[g])
  })

  it('§4.4.1-3: Σshort가 gold보다 1 크면 어떤 지불 구성으로도 구매 불가', () => {
    // 같은 카드, 황금 3개뿐 → Σshort 4 > 3. 위조 지불(gold 4)도, 실보유 지불(gold 3)도 거부돼야 한다
    let s = placeOnBoard(baseState(2), FOUR_ONES.id)
    s = patchPlayer(s, 0, { tokens: tokens({ gold: 3 }) })
    expect(canAfford(s.players[0]!, FOUR_ONES)).toBe(false)
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: FOUR_ONES.id, payment: tokens({ gold: 4 }) }),
      ),
    ).toBe('§4.4.1')
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: FOUR_ONES.id, payment: tokens({ gold: 3 }) }),
      ),
    ).toBe('§4.4.1')
  })

  it('§9-L: 보유 보석 대신 황금을 두 색에 분산 대체하는 비정규 지불도 수락된다', () => {
    // 비용 {blue2, black2}, 보유 {blue2, black1, gold2}
    // 정규 지불은 {blue2, black1, gold1}이지만, 플레이어는 blue 자리에도 황금을 쓸 자유가 있다(§9-L)
    let s = placeOnBoard(baseState(2), B2K2.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 2, black: 1, gold: 2 }) })
    const supplyBefore = s.supply

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: B2K2.id,
      payment: tokens({ blue: 1, black: 1, gold: 2 }), // gold = (2-1)+(2-1) 정확 충당
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ blue: 1 })) // blue 1개는 지킨다
    expect(state.supply.blue).toBe(supplyBefore.blue + 1)
    expect(state.supply.black).toBe(supplyBefore.black + 1)
    expect(state.supply.gold).toBe(supplyBefore.gold + 2)
  })

  it('§4.4.1-4: 지불 총액은 맞지만 미보유 색으로 배분한 지불은 거부된다', () => {
    // 비용 {blue2, black2}, 보유 {blue2, gold2} — canAfford는 참(black 부족 2 ≤ gold 2)
    // 그러나 black 토큰을 1개도 안 갖고서 black 1개를 내는 배분은 불가
    let s = placeOnBoard(baseState(2), B2K2.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 2, gold: 2 }) })
    expect(canAfford(s.players[0]!, B2K2)).toBe(true)
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'PURCHASE',
          cardId: B2K2.id,
          payment: tokens({ blue: 1, black: 1, gold: 2 }), // 총액 4 = Σneed지만 black 미보유
        }),
      ),
    ).toBe('§4.4.1')
  })

  it('§4.4.1-4: 초과 지불 금지 — 필요량보다 1개 더 내는 지불은 형태 불문 거부', () => {
    // 비용 {blue3}, 보유 {blue3, gold2}. "정확히 필요한 만큼만 지불"(§4.4.1-4)
    let s = placeOnBoard(baseState(2), B3.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 3, gold: 2 }) })
    // 총액 4 (blue2+gold2): 황금이 부족분(1)을 초과
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: B3.id, payment: tokens({ blue: 2, gold: 2 }) }),
      ),
    ).toBe('§4.4.1')
    // 총액 4 (blue3+gold1): 보석으로 이미 전액인데 황금 1개 추가
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: B3.id, payment: tokens({ blue: 3, gold: 1 }) }),
      ),
    ).toBe('§4.4.1')
    // 대조군: 부족분과 정확히 일치하는 §9-L 대체 지불은 유효
    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: B3.id,
      payment: tokens({ blue: 2, gold: 1 }),
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ blue: 1, gold: 1 }))
  })

  it('§4.4.1-4: 과소 지불(황금이 부족분 미달)은 거부되고, 전액 황금 대체는 수락된다', () => {
    // 비용 {blue3}, 보유 {blue1, gold3}
    let s = placeOnBoard(baseState(2), B3.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 1, gold: 3 }) })
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: B3.id, payment: tokens({ blue: 1, gold: 1 }) }),
      ),
    ).toBe('§4.4.1') // 총액 2 < 3
    // §9-L: blue를 갖고 있어도 전액 황금(gold3)으로 지불할 자유
    const supplyBefore = s.supply
    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: B3.id,
      payment: tokens({ gold: 3 }),
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ blue: 1 }))
    expect(state.supply.gold).toBe(supplyBefore.gold + 3)
    expect(state.supply.blue).toBe(supplyBefore.blue) // blue는 한 개도 안 나감
  })
})

describe('§4.4.1-5/-6, §5.1 보너스 커버 경계', () => {
  it('§4.4.1-5: 보너스 정확 커버 → 빈 지불만 유효, 잉여 토큰 끼워넣기는 전부 거부', () => {
    // 비용 {red3}, 보너스 red3 → need 전색 0. "정확히 필요한 만큼만"(§4.4.1-4)이므로 0개 지불만 유효
    let s = placeOnBoard(baseState(2), R3_GREEN.id)
    s = patchPlayer(s, 0, { tokens: tokens({ red: 2, gold: 1 }), bonuses: gems({ red: 3 }) })
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: R3_GREEN.id, payment: tokens({ red: 1 }) }),
      ),
    ).toBe('§4.4.1')
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId: R3_GREEN.id, payment: tokens({ gold: 1 }) }),
      ),
    ).toBe('§4.4.1')
    const supplyBefore = s.supply
    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: R3_GREEN.id,
      payment: tokens(),
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 2, gold: 1 })) // 손대지 않음
    expect(state.supply).toEqual(supplyBefore) // 공급처 무변화
    expect(state.players[0]!.purchased).toContain(R3_GREEN.id)
  })

  it('§4.4.1-6: 보너스 초과 커버 — 환급·이월 없이 무료 구매만 성립한다', () => {
    // 비용 {red3}, 보너스 red5 (초과 2). 초과분은 환급되지 않는다: 토큰·공급처 완전 무변화
    let s = placeOnBoard(baseState(2), R3_GREEN.id)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 1 }), bonuses: gems({ red: 5 }) })
    const supplyBefore = s.supply

    const { state } = applyAction(s, { type: 'PURCHASE', cardId: R3_GREEN.id, payment: tokens() })
    expect(state.players[0]!.tokens).toEqual(tokens({ white: 1 })) // 환급으로 늘지 않음
    expect(state.supply).toEqual(supplyBefore)
    expect(state.players[0]!.bonuses).toEqual(gems({ red: 5, green: 1 }))
  })

  it('§5.1+§4.4.1: 보너스 부분 커버 + 보석 + 황금 3중 혼합 지불의 정합', () => {
    // 비용 {blue1, red2, black2}, 보너스 {red2, black1} → need {blue1, black1}
    // 보유 {black1, gold1}: blue 부족 1을 황금으로, black은 보석으로
    let s = placeOnBoard(baseState(2), MIX.id)
    s = patchPlayer(s, 0, { tokens: tokens({ black: 1, gold: 1 }), bonuses: gems({ red: 2, black: 1 }) })
    const supplyBefore = s.supply

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: MIX.id,
      payment: tokens({ black: 1, gold: 1 }),
    })
    expect(state.players[0]!.tokens).toEqual(tokens())
    expect(state.supply.black).toBe(supplyBefore.black + 1)
    expect(state.supply.gold).toBe(supplyBefore.gold + 1)
    expect(state.supply.blue).toBe(supplyBefore.blue) // blue는 황금이 대신 냈으므로 무변화
    expect(state.supply.red).toBe(supplyBefore.red) // red는 보너스 커버 — 지불 없음
  })
})

describe('§4.4/§7 예약 카드 구매 — 보드·덱 무변화', () => {
  it('§4.4: 예약 카드 구매는 보드/덱을 전혀 건드리지 않고, 다른 예약 카드는 유지된다', () => {
    let s = baseState(2)
    const r1 = s.decks[2]![0]!
    const r2 = s.decks[2]![1]!
    // 두 장을 덱에서 빼서 예약 상태로 (90장 분할 보존)
    s = {
      ...s,
      decks: [s.decks[0], s.decks[1], s.decks[2]!.slice(2)] as unknown as typeof s.decks,
    }
    s = patchPlayer(s, 0, {
      tokens: tokens({ ...CARDS[r1]!.cost }),
      reserved: [
        { cardId: r1, fromDeck: true },
        { cardId: r2, fromDeck: true },
      ],
    })
    const boardBefore = s.board.map((row) => [...row])
    const decksBefore = s.decks.map((d) => [...d])
    const payment = canonicalPayment(s.players[0]!, CARDS[r1]!)

    const { state, events } = applyAction(s, { type: 'PURCHASE', cardId: r1, payment })
    expect(state.board).toEqual(boardBefore) // §7: 보충은 공개 카드 구매에만 — 보드 무변화
    expect(state.decks).toEqual(decksBefore) // 덱도 무변화
    expect(state.players[0]!.reserved).toEqual([{ cardId: r2, fromDeck: true }]) // r2만 남는다
    expect(state.players[0]!.purchased).toContain(r1)
    expect(events.some((e) => e.t === 'slotRefilled')).toBe(false)
  })

  it('§4.4: 덱 맨 위 카드(공개도 예약도 아님)를 직접 구매하려는 시도는 거부된다', () => {
    let s = baseState(2)
    const hidden = s.decks[1]![0]! // 티어2 덱 맨 위 — 보드에 없음
    s = patchPlayer(s, 0, { tokens: tokens({ ...CARDS[hidden]!.cost }) })
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'PURCHASE',
          cardId: hidden,
          payment: tokens({ ...CARDS[hidden]!.cost }),
        }),
      ),
    ).toBe('§4.4')
  })
})

describe('§9-M 지불 후 공급처 정합', () => {
  it('§9-M: 지불 토큰은 색별로 정확히 공급처로만 가고, 상대 플레이어에게는 가지 않는다', () => {
    let s = placeOnBoard(baseState(2), B3.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 2, gold: 1 }) })
    const supplyBefore = s.supply
    const opponentBefore = s.players[1]!.tokens
    const totalsBefore = TOKEN_COLORS.map((c) => colorTotal(s, c))
    const payment = tokens({ blue: 2, gold: 1 })

    const { state } = applyAction(s, { type: 'PURCHASE', cardId: B3.id, payment })
    // 색별 공급처 증가량 == 지불량 (전 6색)
    for (const c of TOKEN_COLORS) {
      expect(state.supply[c]).toBe(supplyBefore[c] + payment[c])
    }
    // 상대 플레이어는 1개도 받지 않는다
    expect(state.players[1]!.tokens).toEqual(opponentBefore)
    // 색별 총량 보존 불변식 (공급처 + 전원 소지)
    TOKEN_COLORS.forEach((c, i) => {
      expect(colorTotal(state, c)).toBe(totalsBefore[i])
    })
  })
})

describe('§6/§9-J/§9-N 구매로 같은 턴 귀족 조건 신규 충족', () => {
  it('§6: 구매로 늘어난 보너스가 같은 턴 종료 시 귀족 단일 충족 → 자동 방문 + 3점', () => {
    // 귀족 1: {green3, red3, black3}. 구매 전 green2 — 미충족, green 보너스 카드 구매로 충족
    // 카드 비용 {red3}는 보유 red 보너스 3이 전액 커버(§4.4.1-1) → 무료 구매(§4.4.1-5)로도 귀족이 발동해야 한다
    expect(NOBLES[1]!.requirement).toEqual(gems({ green: 3, red: 3, black: 3 })) // 픽스처 전제
    let s = baseState(2, 1, { nobles: [1] })
    s = placeOnBoard(s, R3_GREEN.id)
    s = patchPlayer(s, 0, {
      bonuses: gems({ green: 2, red: 3, black: 3 }),
    })

    const { state, events } = applyAction(s, {
      type: 'PURCHASE',
      cardId: R3_GREEN.id,
      payment: tokens(), // need 전색 0 — 빈 지불만 유효 (§4.4.1-4/-5)
    })
    const p = state.players[0]!
    expect(p.nobles).toEqual([1]) // 같은 턴에 자동 수여 (§6 방문 거부 불가)
    expect(p.prestige).toBe(R3_GREEN.points + 3) // 카드 점수 + 귀족 3점
    expect(state.nobles).toEqual([]) // 테이블에서 제거, 보충 없음 (§6)
    expect(events.map((e) => e.t)).toEqual([
      'cardPurchased',
      'slotRefilled',
      'nobleVisited',
      'turnEnded',
    ])
  })

  it('§9-J: 구매 1회로 복수 귀족 동시 충족 → 선택 대기, 1장만 수령, 잔여 귀족은 테이블 유지', () => {
    // 귀족 1 {g3,r3,k3}, 귀족 5 {w3,r3,k3}: red 2 → 3이 되는 순간 둘 다 충족
    // 카드 비용 {white3}는 white 보너스 3이 전액 커버 → 빈 지불이 유일한 유효 지불 (§4.4.1-4/-5)
    expect(NOBLES[5]!.requirement).toEqual(gems({ white: 3, red: 3, black: 3 })) // 픽스처 전제
    let s = baseState(2, 1, { nobles: [1, 5] })
    s = placeOnBoard(s, W3_RED.id) // 보너스 red
    s = patchPlayer(s, 0, {
      bonuses: gems({ white: 3, green: 3, red: 2, black: 3 }),
    })

    const mid = applyAction(s, {
      type: 'PURCHASE',
      cardId: W3_RED.id,
      payment: tokens(),
    })
    const phase = mid.state.phase
    if (phase.kind !== 'chooseNoble') throw new Error(`chooseNoble 대기여야 하는데 ${phase.kind}`)
    expect([...phase.options].sort((a, b) => a - b)).toEqual([1, 5])
    expect(mid.state.currentPlayer).toBe(0) // 아직 내 턴 — 선택 전
    expect(mid.state.players[0]!.nobles).toEqual([]) // 자동 수여 금지 (플레이어 선택)
    // §4: 귀족 선택 대기 중 두 번째 행동(추가 구매)은 불가 — 한 턴 한 행동
    expect(
      ruleOf(() =>
        applyAction(mid.state, { type: 'PURCHASE', cardId: FOUR_ONES.id, payment: tokens() }),
      ),
    ).toBe('§4')

    const { state } = applyAction(mid.state, { type: 'CHOOSE_NOBLE', nobleId: 5 })
    expect(state.players[0]!.nobles).toEqual([5]) // 정확히 1장
    expect(state.players[0]!.prestige).toBe(W3_RED.points + 3)
    expect(state.nobles).toEqual([1]) // 나머지 귀족은 테이블에 남는다 (§9-J)
    expect(state.currentPlayer).toBe(1) // 선택 후에야 턴 종료
  })

  it('§9-N: 예약 카드의 보너스는 귀족 판정에 포함되지 않는다', () => {
    // 귀족 1은 green3 요구. 구매 보너스 green2 + "예약 중인 green 카드"가 있어도 미충족이어야 한다
    let s = baseState(2, 1, { nobles: [1] })
    s = placeOnBoard(s, B3.id) // 구매할 카드는 white 보너스 — green과 무관
    const greenId = s.decks[0]!.find((id) => CARDS[id]!.bonus === 'green')!
    s = {
      ...s,
      decks: [
        s.decks[0]!.filter((id) => id !== greenId),
        s.decks[1],
        s.decks[2],
      ] as unknown as typeof s.decks,
    }
    s = patchPlayer(s, 0, {
      tokens: tokens({ blue: 3 }),
      bonuses: gems({ green: 2, red: 3, black: 3 }),
      reserved: [{ cardId: greenId, fromDeck: false }],
    })

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: B3.id,
      payment: tokens({ blue: 3 }),
    })
    expect(state.players[0]!.nobles).toEqual([]) // 예약 카드 보너스는 무효 (§9-N)
    expect(state.nobles).toEqual([1]) // 귀족은 그대로 테이블에
    expect(state.players[0]!.reserved).toEqual([{ cardId: greenId, fromDeck: false }])
    expect(state.currentPlayer).toBe(1) // chooseNoble 없이 정상 턴 종료
  })
})

describe('§4.4.1-4 canonicalPayment/isValidPayment 계약 — 황금 최소 사용', () => {
  it('§4.4.1-4: canonicalPayment는 황금을 Σshort(최소)만 쓰고, 유효 지불 전수 열거와 일치한다', () => {
    // 비용 {white3}, 보유 {white1, gold3} → need 3, short 2
    const p1 = mkPlayer({ white: 1, gold: 3 })
    expect(canAfford(p1, W3_RED)).toBe(true)
    const canon1 = canonicalPayment(p1, W3_RED)
    expect(canon1).toEqual(tokens({ white: 1, gold: 2 })) // 보석 최대, 황금 최소 = Σshort

    let minGoldSeen = Number.POSITIVE_INFINITY
    for (let w = 0; w <= 5; w++) {
      for (let g = 0; g <= 5; g++) {
        const ok = isValidPayment(p1, W3_RED, tokens({ white: w, gold: g }))
        // RULES §4.4.1-4에서 도출한 유효 조건:
        //   w ≤ min(need 3, 보유 1) ∧ g == need - w (부족분 정확 충당) ∧ g ≤ 보유 3
        const expected = w <= 1 && g === 3 - w && g <= 3
        expect(ok).toBe(expected)
        if (ok && g < minGoldSeen) minGoldSeen = g
      }
    }
    expect(canon1.gold).toBe(minGoldSeen) // 계약: canonical은 황금 최소 지불안

    // 보너스가 낀 변형: 보너스 white1 → need 2
    const p2 = mkPlayer({ white: 1, gold: 3 }, { white: 1 })
    const canon2 = canonicalPayment(p2, W3_RED)
    expect(canon2).toEqual(tokens({ white: 1, gold: 1 }))
    for (let w = 0; w <= 5; w++) {
      for (let g = 0; g <= 5; g++) {
        const expected = w <= 1 && g === 2 - w
        expect(isValidPayment(p2, W3_RED, tokens({ white: w, gold: g }))).toBe(expected)
      }
    }
  })

  it('§4.4.1: 음수·비정수 황금 주입 공격은 거부되고 원본 상태는 무손상이다', () => {
    // 비용 {white3}, 보유 {white3} (gold 0)
    let s = placeOnBoard(baseState(2), W3_RED.id)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 3 }) })
    const snapshot = JSON.parse(JSON.stringify(s)) as unknown

    // 음수 황금으로 토큰 주조 시도 (white 4 - gold 1 = 총액 3 위장)
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'PURCHASE',
          cardId: W3_RED.id,
          payment: tokens({ white: 4, gold: -1 }),
        }),
      ),
    ).toBe('§4.4.1')
    // 미보유 황금 지불
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'PURCHASE',
          cardId: W3_RED.id,
          payment: tokens({ white: 2, gold: 1 }),
        }),
      ),
    ).toBe('§4.4.1')
    // 소수 지불
    expect(
      ruleOf(() =>
        applyAction(s, {
          type: 'PURCHASE',
          cardId: W3_RED.id,
          payment: tokens({ white: 2.5, gold: 0.5 }),
        }),
      ),
    ).toBe('§4.4.1')
    // 실패한 액션은 상태를 조금도 바꾸지 않는다
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot)
  })
})
