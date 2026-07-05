// 적대적 테스트 — legalActions 완전 열거 공격 (RULES.md §4, §5, §6, §9 / ARCHITECTURE.md §3)
// 기대값은 전부 RULES.md와 수학(이항계수·중복조합·포함-배제)에서 독립 도출했다. 엔진 동작 역산 금지.
//
// 공격 각도:
//  - 기묘한 공급 분포(잔존 0/1/2/3/4/5색 × 황금 유무)에서 TAKE_DIFFERENT 조합 수 = C(n, min(3,n))
//    — 조합 집합 자체를 비트마스크 오라클(엔진 chooseK와 독립)과 대조
//  - discard phase 반납 조합 전수성 — 중복조합 공식 C(n+k-1,k) + 포함-배제로 독립 계산한
//    기대 개수(33/32)와 개수·집합 모두 대조, 황금 포함 조합(14개)의 전수성 검증
//  - mustDiscard 3에서 여러 색을 정확히 1개씩 보유한 경계 — 보유량 초과 조합 열거 금지
//  - chooseNoble 열거 = 충족 귀족 전체·보드 순서(§9-J), 미충족·미공개 귀족 배제
//  - 마스킹 상태(playerView)에서의 열거 안전성 — 자기 시점 완전 동일,
//    타인 시점은 숨은 예약 구매 정확히 1개만 제외 (§9-O)
//  - 열거 순서 결정론 — 같은 상태 2회 호출·직렬화 왕복 후 순서까지 deep equal

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { CARDS } from '../../src/engine/data/cards'
import { NOBLES } from '../../src/engine/data/nobles'
import { isLegal, legalActions } from '../../src/engine/legal'
import { deserialize, serialize } from '../../src/engine/serialize'
import { tokenTotal } from '../../src/engine/tokens'
import { playerView } from '../../src/engine/view'
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type Action,
  type GameState,
  type TokenMap,
} from '../../src/engine/types'
import { baseState, gems, patchPlayer, tokens } from '../helpers'

// ── 독립 오라클·수학 유틸 (엔진 알고리즘과 다른 방식으로 계산) ──────────────

/** 이항계수 — 기대 조합 수의 독립 계산용 */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1)
  return out
}

const isTakeDifferent = (a: Action): a is Extract<Action, { type: 'TAKE_DIFFERENT' }> =>
  a.type === 'TAKE_DIFFERENT'
const isDiscard = (a: Action): a is Extract<Action, { type: 'DISCARD' }> =>
  a.type === 'DISCARD'

const tdKey = (a: Extract<Action, { type: 'TAKE_DIFFERENT' }>): string =>
  [...a.colors].sort().join(',')

/**
 * RULES §4.1(엄격 해석)+§9-A/B에서 도출한 TAKE_DIFFERENT 기대 집합.
 * 5색 부분집합 32개를 비트마스크로 전수 스캔 — 엔진 chooseK 재귀와 독립.
 */
function expectedTakeDifferentKeys(supply: TokenMap): ReadonlySet<string> {
  const n = GEM_COLORS.filter((c) => supply[c] > 0).length
  const need = Math.min(3, n)
  const out = new Set<string>()
  if (need === 0) return out // §9-A: 0개 획득은 행동으로 불성립
  for (let mask = 1; mask < 32; mask++) {
    const combo = GEM_COLORS.filter((_, i) => (mask & (1 << i)) !== 0)
    if (combo.length === need && combo.every((c) => supply[c] > 0)) {
      out.add([...combo].sort().join(','))
    }
  }
  return out
}

const discardKey = (t: TokenMap): string => TOKEN_COLORS.map((c) => t[c]).join(',')

/**
 * RULES §5에서 도출한 반납 조합 기대 집합 — 색별 0..k 6중 루프 전수 스캔.
 * 엔진 discardCombos의 하강 재귀와 독립적인 계산 경로다.
 */
function expectedDiscardKeys(holdings: TokenMap, k: number): ReadonlySet<string> {
  const out = new Set<string>()
  for (let w = 0; w <= k; w++)
    for (let b = 0; b <= k; b++)
      for (let g = 0; g <= k; g++)
        for (let r = 0; r <= k; r++)
          for (let bl = 0; bl <= k; bl++)
            for (let au = 0; au <= k; au++) {
              if (w + b + g + r + bl + au !== k) continue
              const v: TokenMap = { white: w, blue: b, green: g, red: r, black: bl, gold: au }
              if (TOKEN_COLORS.some((c) => v[c] > holdings[c])) continue
              out.add(discardKey(v))
            }
  return out
}

const countByType = (actions: readonly Action[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const a of actions) out[a.type] = (out[a.type] ?? 0) + 1
  return out
}

// ── 공용 픽스처 빌더 (결정론 테스트에서 재사용) ──────────────────────────────

/**
 * 시나리오 A: 2인전 토큰 총량(색4·금5)과 완전 정합인 실제 도달 상태.
 * P0 보유 w2b2g2r2au2(10개)에서 합법 TAKE_DIFFERENT(w,b,g) → 13개 → mustDiscard 3.
 * discard 시점 보유: w3 b3 g3 r2 k0 au2.
 */
function discardStateA(): GameState {
  let s = baseState(2, 1, {
    supply: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 4, gold: 3 }),
  })
  s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, gold: 2 }) })
  const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'green'] }).state
  expect(mid.phase).toEqual({ kind: 'discard', mustDiscard: 3 })
  return mid
}

/**
 * chooseNoble 픽스처: 공개 귀족 [5,7,0,2], P0 보너스 w3 g4 r4 k4 (b0).
 * 5✓(w3r3k3) / 7✗(b3 불충족) / 0✓(r4k4) / 2✓(g4r4) → 합법 TAKE_SAME 후 options [5,0,2].
 */
function chooseNobleState(): GameState {
  let s = baseState(2, 1, { nobles: [5, 7, 0, 2] })
  s = patchPlayer(s, 0, { bonuses: gems({ white: 3, green: 4, red: 4, black: 4 }) })
  const mid = applyAction(s, { type: 'TAKE_SAME', color: 'red' }).state
  expect(mid.phase).toEqual({ kind: 'chooseNoble', options: [5, 0, 2] })
  return mid
}

// ═══════════════════════════════════════════════════════════════════════════

describe('공격: §4.1/§9-A/B — 기묘한 공급 분포에서 TAKE_DIFFERENT 조합 수 (잔존 색 수 × 황금 유무)', () => {
  // 잔존 서로 다른 색 수 n → 기대 조합 수 = C(n, min(3,n)) (n=0이면 §9-A로 0개)
  //   n=5→C(5,3)=10, n=4→C(4,3)=4, n=3→C(3,3)=1, n=2→C(2,2)=1, n=1→C(1,1)=1, n=0→0
  const SWEEP = [
    { label: '5색 잔존', supplyGems: { white: 4, blue: 4, green: 4, red: 4, black: 4 }, n: 5 },
    { label: '4색 잔존(1~4개 혼합)', supplyGems: { blue: 2, green: 1, red: 3, black: 4 }, n: 4 },
    { label: '3색 잔존', supplyGems: { blue: 1, green: 3, red: 4 }, n: 3 },
    { label: '2색 잔존', supplyGems: { green: 2, black: 1 }, n: 2 },
    { label: '1색 잔존', supplyGems: { red: 7 }, n: 1 },
    { label: '0색 잔존', supplyGems: {}, n: 0 },
  ] as const

  it('조합 수 = C(n, min(3,n)) — 집합까지 비트마스크 오라클과 일치, 황금 유무는 무영향', () => {
    for (const c of SWEEP) {
      for (const gold of [0, 5]) {
        const s = baseState(2, 1, { supply: tokens({ ...c.supplyGems, gold }) })
        const legal = legalActions(s)
        const tds = legal.filter(isTakeDifferent)
        const tag = `${c.label}/gold=${gold}`

        // 개수: 이항계수에서 독립 도출 (§4.1은 "서로 다른 색" — 중복 없는 조합)
        const expectedCount = c.n === 0 ? 0 : binom(c.n, Math.min(3, c.n))
        expect(tds.length, tag).toBe(expectedCount)

        // 집합: 오라클과 완전 일치 + 열거 내부 중복 없음
        const keys = tds.map(tdKey)
        expect(new Set(keys).size, `${tag} 중복 열거`).toBe(keys.length)
        expect(new Set(keys), `${tag} 조합 집합`).toEqual(expectedTakeDifferentKeys(s.supply))

        // §9-F: 어떤 조합에도 황금이 끼어들면 안 된다
        for (const a of tds) {
          expect((a.colors as readonly string[]).includes('gold'), tag).toBe(false)
        }

        // §4.2: TAKE_SAME은 supply ≥ 4인 색 수와 정확히 일치
        const sameCount = legal.filter((a) => a.type === 'TAKE_SAME').length
        expect(sameCount, `${tag} TAKE_SAME`).toBe(
          GEM_COLORS.filter((g) => s.supply[g] >= 4).length,
        )

        // 완전성 불변식: 전 원소 isLegal + throw 없는 적용
        for (const a of legal) {
          expect(isLegal(s, a), `${tag} ${JSON.stringify(a)}`).toBe(true)
          expect(() => applyAction(s, a), `${tag} ${JSON.stringify(a)}`).not.toThrow()
        }
      }
    }
  })

  it('§9-A×§4.3: 보석 0색 — TAKE 계열 0개·PASS 없음, 예약 15개(보드12+덱3)만 열거되고 황금 유무와 무관하다', () => {
    const withGold = baseState(2, 1, { supply: tokens({ gold: 5 }) })
    const noGold = baseState(2, 1, { supply: tokens() })
    for (const s of [withGold, noGold]) {
      // §9-F: 황금이 5개 있어도 행동 A/B는 되살아나지 않는다. §4.3: 예약은 황금 없이도 성립
      expect(countByType(legalActions(s))).toEqual({ RESERVE_BOARD: 12, RESERVE_DECK: 3 })
    }
    // 두 열거는 순서까지 완전 동일해야 한다 (§4.3 예약 성립은 황금과 무관)
    expect(legalActions(withGold)).toEqual(legalActions(noGold))
  })

  it('§9-G×§9-F: 황금 5개가 남아 있어도 예약 3장+구매 불가면 정확히 [PASS] — 황금은 도달 불가 자원이다', () => {
    let s = baseState(2, 1, { supply: tokens({ gold: 5 }) })
    s = patchPlayer(s, 0, {
      reserved: [0, 1, 2].map((i) => ({ cardId: s.decks[2]![i]!, fromDeck: true })),
    })
    s = patchPlayer(s, 1, {
      reserved: [0, 1, 2].map((i) => ({ cardId: s.decks[1]![i]!, fromDeck: true })),
    })
    // 보석 0 → A/B 불가. 예약 3장 → C 불가(§9-D). 토큰 0·보너스 0 → D 불가.
    // 황금이 공급처에 있어도 예약으로만 얻을 수 있으므로(§9-F) 합법수는 공집합 → [PASS] (§9-G)
    expect(legalActions(s)).toEqual([{ type: 'PASS' }])
    expect(isLegal(s, { type: 'PASS' })).toBe(true)
    expect(() => applyAction(s, { type: 'PASS' })).not.toThrow()
  })
})

describe('공격: §5 — discard phase 반납 조합 전수성 (중복조합 공식·포함-배제 대조)', () => {
  it('보유 w3b3g3r2k0au2·mustDiscard 3 → 정확히 33개 = C(7,3)−2 (포함-배제), 집합도 오라클과 일치', () => {
    // 수학적 도출 (중복조합 공식): 6색 무제한이면 C(6+3-1,3)=C(8,3)=56이 상한.
    // 여기서 black 보유 0 → 사실상 5색: C(5+3-1,3)=C(7,3)=35.
    // 상한 위반 해는 red=3(보유 2) 1건 + gold=3(보유 2) 1건뿐 → 35 − 2 = 33.
    const mid = discardStateA()
    const holdings = mid.players[0]!.tokens
    expect(holdings).toEqual(tokens({ white: 3, blue: 3, green: 3, red: 2, gold: 2 }))

    const legal = legalActions(mid)
    expect(legal.every(isDiscard)).toBe(true)
    expect(legal.length).toBe(33)

    const keys = legal.filter(isDiscard).map((a) => discardKey(a.tokens))
    expect(new Set(keys).size, '중복 열거').toBe(33)
    expect(new Set(keys)).toEqual(expectedDiscardKeys(holdings, 3))

    // 완전성 불변식 + §5: 적용 후 정확히 10개로 복귀
    for (const a of legal) {
      expect(isLegal(mid, a)).toBe(true)
      const after = applyAction(mid, a).state
      expect(tokenTotal(after.players[0]!.tokens)).toBe(10)
    }
  })

  it('§5+§9-H: 황금 포함 반납 조합 전수 — gold≥1이 14개(gold=1:10, gold=2:4), gold=3은 보유 초과라 없음', () => {
    // gold=1: 나머지 2를 (w≤3,b≤3,g≤3,r≤2)에 → C(4+2-1,2)=C(5,2)=10 (상한 위반 없음)
    // gold=2: 나머지 1 → 4가지. gold=3: 보유 2 초과 → 0가지. 합계 14
    const mid = discardStateA()
    const golds = legalActions(mid).filter(isDiscard).filter((a) => a.tokens.gold >= 1)
    expect(golds.length).toBe(14)
    expect(golds.filter((a) => a.tokens.gold === 1)).toHaveLength(10)
    expect(golds.filter((a) => a.tokens.gold === 2)).toHaveLength(4)
    expect(golds.some((a) => a.tokens.gold >= 3)).toBe(false)
    // §5 "반납 자유 선택": 방금 가져온 색과 무관한 {white1 + gold2} 조합도 실재해야 한다
    const keys = new Set(golds.map((a) => discardKey(a.tokens)))
    expect(keys.has(discardKey(tokens({ white: 1, gold: 2 })))).toBe(true)
  })

  it('§5 경계: mustDiscard 3에서 4개 색을 정확히 1개씩 보유 — 32개, 보유량 초과 조합은 단 하나도 없다', () => {
    // 3인전 총량(색5·금5) 정합 상태: P0 w5b4au1(10개) + 공급 g1r1k1 → 합법 TAKE(g,r,k) → 13개.
    // 보유 (w5 b4 g1 r1 k1 au1)에서 3개 반납: 단위색(g,r,k,au) t개 선택 × 나머지 3−t를 w,b에 분배
    //   Σ_t C(4,t)·(3−t+1) = 1·4 + 4·3 + 6·2 + 4·1 = 32
    let s = baseState(3, 3, { supply: tokens({ blue: 1, green: 5, red: 5, black: 5, gold: 4 }) })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 4, gold: 1 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['green', 'red', 'black'] }).state
    expect(mid.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    const holdings = mid.players[0]!.tokens
    expect(holdings).toEqual(
      tokens({ white: 5, blue: 4, green: 1, red: 1, black: 1, gold: 1 }),
    )

    const legal = legalActions(mid)
    expect(legal.length).toBe(32)
    const keys = legal.filter(isDiscard).map((a) => discardKey(a.tokens))
    expect(new Set(keys)).toEqual(expectedDiscardKeys(holdings, 3))

    // 보유 1개 색을 2개 이상 반납하는 조합이 열거되면 §5 위반
    for (const a of legal.filter(isDiscard)) {
      for (const c of TOKEN_COLORS) {
        expect(a.tokens[c], `${discardKey(a.tokens)}의 ${c}`).toBeLessThanOrEqual(holdings[c])
      }
    }
  })

  it('§9-H: 10개 소지+예약 황금 → mustDiscard 1 — 보유 색 수(3)만큼 단일 반납, 방금 받은 황금 반납 포함', () => {
    // 3인전 정합: 공급 g5r5k5au5, P0 w5b5(10개). 예약 → 황금 +1 → 11개 → 1개 반납
    let s = baseState(3, 5, { supply: tokens({ green: 5, red: 5, black: 5, gold: 5 }) })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 5 }) })
    const mid = applyAction(s, { type: 'RESERVE_DECK', tier: 1 }).state
    expect(mid.phase).toEqual({ kind: 'discard', mustDiscard: 1 })

    const legal = legalActions(mid)
    expect(legal).toHaveLength(3) // 보유 색: white, blue, gold — 각 1개 반납만 가능
    const keys = new Set(legal.filter(isDiscard).map((a) => discardKey(a.tokens)))
    expect(keys).toEqual(
      new Set([
        discardKey(tokens({ white: 1 })),
        discardKey(tokens({ blue: 1 })),
        discardKey(tokens({ gold: 1 })), // §9-H: 방금 받은 황금을 그대로 반납해도 된다
      ]),
    )
    for (const a of legal) expect(() => applyAction(mid, a)).not.toThrow()
  })
})

describe('공격: §6/§9-J — chooseNoble 열거와 순서', () => {
  it('§9-J: 충족 귀족 전체가 보드 순서대로 열거되고, 미충족·미공개 귀족은 배제된다', () => {
    // 데이터 전제 확인 (data/nobles.ts — 교차 검증본과 이 테스트의 가정이 일치하는지 먼저 고정)
    expect(NOBLES[5]!.requirement).toEqual(gems({ white: 3, red: 3, black: 3 }))
    expect(NOBLES[7]!.requirement).toEqual(gems({ white: 3, blue: 3, green: 3 }))
    expect(NOBLES[0]!.requirement).toEqual(gems({ red: 4, black: 4 }))
    expect(NOBLES[2]!.requirement).toEqual(gems({ green: 4, red: 4 }))

    const mid = chooseNobleState()

    // §9-J: 동시 충족 귀족 전원이 선택지 — 공개(보드) 순서 [5,0,2] 그대로, 빠짐도 추가도 없음
    const legal = legalActions(mid)
    expect(legal).toEqual([
      { type: 'CHOOSE_NOBLE', nobleId: 5 },
      { type: 'CHOOSE_NOBLE', nobleId: 0 },
      { type: 'CHOOSE_NOBLE', nobleId: 2 },
    ])
    // 미충족(7: blue 3 요구)·이번 게임 미공개(1) 귀족은 불법이어야 한다
    expect(isLegal(mid, { type: 'CHOOSE_NOBLE', nobleId: 7 })).toBe(false)
    expect(isLegal(mid, { type: 'CHOOSE_NOBLE', nobleId: 1 })).toBe(false)

    // 각 선택지는 정확히 그 귀족 1장만 수여하고(§6 "한 턴에 1장"), 나머지는 잔존한다(§9-J)
    for (const a of legal) {
      if (a.type !== 'CHOOSE_NOBLE') continue
      const after = applyAction(mid, a).state
      expect(after.players[0]!.nobles).toEqual([a.nobleId])
      expect(after.players[0]!.prestige).toBe(3) // 귀족 3점만 (§6)
      expect(after.nobles).toEqual([5, 7, 0, 2].filter((id) => id !== a.nobleId))
      expect(after.phase).toEqual({ kind: 'play' })
      expect(after.currentPlayer).toBe(1)
    }
  })
})

describe('공격: §9-O — 마스킹 상태(playerView)에서의 열거 안전성', () => {
  /** P0·P1이 각각 합법 덱 예약을 마친 뒤 P0 차례. P0는 자기 비공개 예약 카드를 정확히 살 수 있다 */
  function maskedFixture(): { s: GameState; rid: number } {
    let s = baseState(2, 9)
    s = applyAction(s, { type: 'RESERVE_DECK', tier: 1 }).state // P0: 비공개 예약 + 황금
    s = applyAction(s, { type: 'RESERVE_DECK', tier: 2 }).state // P1: 비공개 예약 + 황금
    const rid = s.players[0]!.reserved[0]!.cardId
    s = patchPlayer(s, 0, { tokens: tokens({ ...CARDS[rid]!.cost }) }) // 비용 딱 맞게 지급
    expect(s.currentPlayer).toBe(0)
    return { s, rid }
  }

  it('자기 시점: 열거가 실제 상태와 순서까지 완전 동일 — 자기 비공개 예약 구매도 포함된다', () => {
    const { s, rid } = maskedFixture()
    const real = legalActions(s)
    // 전제: 실제 상태에서 예약 카드 구매가 열거된다 (§4.4 자신의 예약 카드 구매)
    expect(real.filter((a) => a.type === 'PURCHASE' && a.cardId === rid)).toHaveLength(1)
    // 자기 시점 마스킹은 자기 정보를 가리지 않으므로(§9-O) 열거는 완전 동일해야 한다
    expect(legalActions(playerView(s, 0))).toEqual(real)
  })

  it('타인 시점: 숨은 예약 구매 정확히 1개만 빠지고 나머지는 순서까지 동일, HIDDEN(-1) 액션 없음', () => {
    const { s, rid } = maskedFixture()
    const real = legalActions(s)
    const masked = legalActions(playerView(s, 1)) // P1 시점에서 P0 차례를 탐색 (AI 경로와 동일)

    // 마스킹 센티널(-1)이 액션으로 새어 나오면 안 된다
    expect(masked.every((a) => a.type !== 'PURCHASE' || a.cardId >= 0)).toBe(true)
    // 차이는 정확히 "숨은 예약 카드 구매" 1건 — 그 외는 순서 보존
    expect(masked).toEqual(real.filter((a) => !(a.type === 'PURCHASE' && a.cardId === rid)))
    // 완전성 불변식은 마스킹 상태에서도 유지된다
    expect(masked.length).toBeGreaterThan(0)
  })
})

describe('공격: 열거 순서 결정론', () => {
  it('같은 상태 2회 호출 — play(기묘 분포)/discard/chooseNoble 전 phase에서 순서까지 deep equal', () => {
    const play = baseState(2, 1, {
      supply: tokens({ blue: 2, green: 1, red: 3, black: 4, gold: 5 }),
    })
    expect(legalActions(play)).toEqual(legalActions(play))

    const dis = discardStateA()
    expect(legalActions(dis)).toEqual(legalActions(dis))

    const noble = chooseNobleState()
    expect(legalActions(noble)).toEqual(legalActions(noble))
  })

  it('직렬화 왕복(serialize→deserialize) 후에도 열거가 순서까지 동일하다', () => {
    const states = [baseState(3, 42), discardStateA(), chooseNobleState()]
    for (const s of states) {
      const round = deserialize(serialize(s))
      expect(legalActions(round)).toEqual(legalActions(s))
    }
  })
})
