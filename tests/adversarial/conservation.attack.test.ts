// 적대적 테스트 — 보존 법칙과 상태 정합 (docs/RULES.md 전 조항 횡단)
//
// 공격 방식: validateAction으로 합법 후보를 골라가며 긴 액션 시퀀스(20수 이상)를
// 완주하고, 매 수마다 RULES.md에서 도출한 보존 법칙을 검사한다.
//   - §1/§2/§9-M: 색별 토큰 총량 보존 (공급처 + 전원 소지 = 초기 총량)
//   - §1/§7:      카드 90장 분할 보존 (덱 + 보드 + 구매 + 예약 = 정확히 0..89)
//   - §3/§5.1/§6: bonuses/prestige 캐시 = purchased/nobles 재계산값
//   - §5:         턴 종료 시 전원 토큰 ≤ 10 (discard phase 밖에서는 항상)
//   - §6:         귀족 타일 보존 (보충 없음, 중복 없음)
//   - §7:         빈 슬롯은 덱 소진 시에만
// 기대값은 전부 RULES.md에서 도출했다 (엔진 동작 역산 금지).
// 지불 판정도 엔진의 payment 모듈을 신뢰하지 않고 §4.4.1을 테스트 안에서 재구현한다.

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CARDS,
  GEM_COLORS,
  TOKEN_COLORS,
  ZERO_GEMS,
  ZERO_TOKENS,
  addTokens,
  applyAction,
  subtractTokens,
  tokenTotal,
  validateAction,
  withGemDelta,
  withTokenDelta,
} from '../../src/engine'
import type {
  Action,
  Card,
  GameState,
  GemColor,
  GemMap,
  NobleId,
  PlayerState,
  TokenColor,
  TokenMap,
} from '../../src/engine'
import { baseState, findCard, patchPlayer, placeOnBoard, tokens } from '../helpers'

// ────────────────────────────────────────────────────────────────────────────
// RULES.md에서 직접 옮긴 기준값 (엔진 constants를 참조하지 않는다)
// ────────────────────────────────────────────────────────────────────────────

/** §2 인원수별 각 보석 색 토큰 수 */
const RULES_GEM_SUPPLY: Readonly<Record<number, number>> = { 2: 4, 3: 5, 4: 7 }
/** §2 "황금은 건드리지 않는다" — 항상 5개 */
const RULES_GOLD_SUPPLY = 5
/** §1 개발 카드 총 90장 */
const RULES_TOTAL_CARDS = 90
/** §5 토큰 소지 상한 */
const RULES_TOKEN_LIMIT = 10
/** §4.3 예약 상한 */
const RULES_RESERVE_LIMIT = 3
/** §6 귀족 타일은 각 3 명성점 */
const RULES_NOBLE_POINTS = 3

// ────────────────────────────────────────────────────────────────────────────
// §4.4.1 지불 판정 재구현 (룰 문서 → 코드; 엔진 payment 모듈 비참조)
// ────────────────────────────────────────────────────────────────────────────

/** §5.1: 보너스 = 구매 카드 좌상단 보석 표시의 재집계 (캐시 비신뢰) */
function recountBonuses(p: PlayerState): GemMap {
  let b: GemMap = ZERO_GEMS
  for (const id of p.purchased) b = withGemDelta(b, CARDS[id]!.bonus, 1)
  return b
}

/** §3/§6: 명성점 = 구매 카드 점수 합 + 귀족 3점씩 (캐시 비신뢰) */
function recountPrestige(p: PlayerState): number {
  let pts = 0
  for (const id of p.purchased) pts += CARDS[id]!.points
  return pts + p.nobles.length * RULES_NOBLE_POINTS
}

/** §4.4.1-1: need[c] = max(0, cost[c] - bonus[c]) */
function ruleNeed(p: PlayerState, card: Card): GemMap {
  const b = recountBonuses(p)
  return {
    white: Math.max(0, card.cost.white - b.white),
    blue: Math.max(0, card.cost.blue - b.blue),
    green: Math.max(0, card.cost.green - b.green),
    red: Math.max(0, card.cost.red - b.red),
    black: Math.max(0, card.cost.black - b.black),
  }
}

/** §4.4.1-3: Σ short[c] ≤ gold */
function ruleCanAfford(p: PlayerState, card: Card): boolean {
  const need = ruleNeed(p, card)
  const short = GEM_COLORS.reduce((s, c) => s + Math.max(0, need[c] - p.tokens[c]), 0)
  return short <= p.tokens.gold
}

/**
 * §4.4.1-4 유효 지불안 생성. 기본은 보석 우선이고,
 * 확률적으로 §9-L(보석 보유 중 황금 대체 지불)을 섞어 황금 경로도 공격한다.
 */
function buildPayment(p: PlayerState, card: Card, rnd: () => number): TokenMap {
  const need = ruleNeed(p, card)
  const gemPay: Record<GemColor, number> = {
    white: Math.min(need.white, p.tokens.white),
    blue: Math.min(need.blue, p.tokens.blue),
    green: Math.min(need.green, p.tokens.green),
    red: Math.min(need.red, p.tokens.red),
    black: Math.min(need.black, p.tokens.black),
  }
  const mandatoryGold = GEM_COLORS.reduce((g, c) => g + (need[c] - gemPay[c]), 0)
  if (rnd() < 0.4) {
    // §9-L: 여유 황금이 있으면 보석 지불 일부를 황금으로 대체
    let leftover = p.tokens.gold - mandatoryGold
    for (const c of GEM_COLORS) {
      if (leftover <= 0) break
      const sub = Math.min(leftover, gemPay[c])
      gemPay[c] -= sub
      leftover -= sub
    }
  }
  const gold = GEM_COLORS.reduce((g, c) => g + (need[c] - gemPay[c]), 0)
  return { ...gemPay, gold }
}

// ────────────────────────────────────────────────────────────────────────────
// 시뮬레이션 드라이버 — validateAction으로 합법 후보를 골라 진행
// ────────────────────────────────────────────────────────────────────────────

/** 결정론 정책용 PRNG (mulberry32) — 엔진 RNG와 무관 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!
}

function combinations<T>(items: readonly T[], k: number): (readonly T[])[] {
  if (k === 0) return [[]]
  const out: (readonly T[])[] = []
  for (let i = 0; i <= items.length - k; i++) {
    const head = items[i]!
    for (const tail of combinations(items.slice(i + 1), k - 1)) {
      out.push([head, ...tail])
    }
  }
  return out
}

/** §5: 반납할 토큰은 자유 선택 — 소지분에서 무작위로 mustDiscard개 뽑는다 */
function randomDiscard(p: PlayerState, mustDiscard: number, rnd: () => number): TokenMap {
  const pool: TokenColor[] = []
  for (const c of TOKEN_COLORS) {
    for (let i = 0; i < p.tokens[c]; i++) pool.push(c)
  }
  let out: TokenMap = ZERO_TOKENS
  for (let i = 0; i < mustDiscard; i++) {
    const idx = Math.floor(rnd() * pool.length)
    out = withTokenDelta(out, pool[idx]!, 1)
    pool.splice(idx, 1)
  }
  return out
}

/**
 * 현재 phase에서 RULES §4/§5/§6/§9로부터 도출한 합법 후보를 만들고,
 * 전 후보를 validateAction으로 검증(엔진 과잉 거부 탐지)한 뒤 하나를 고른다.
 */
function chooseAction(
  s: GameState,
  rnd: () => number,
  reject: (msg: string) => void,
): Action {
  const phase = s.phase
  const me = s.players[s.currentPlayer]!

  if (phase.kind === 'discard') {
    return { type: 'DISCARD', tokens: randomDiscard(me, phase.mustDiscard, rnd) }
  }
  if (phase.kind === 'chooseNoble') {
    return { type: 'CHOOSE_NOBLE', nobleId: pick(rnd, phase.options) }
  }
  if (phase.kind === 'gameOver') {
    throw new Error('드라이버 오류: gameOver 상태에서 행동을 고를 수 없다')
  }

  const boardIds = s.board.flatMap((row) => row.filter((c): c is number => c !== null))

  // 행동 D 후보 (§4.4: 공개 카드 + 자신의 예약 카드)
  const purchases: Action[] = []
  const purchasable = [
    ...boardIds,
    ...me.reserved.filter((r) => r.cardId >= 0).map((r) => r.cardId),
  ].filter((id) => ruleCanAfford(me, CARDS[id]!))
  for (const id of purchasable) {
    purchases.push({ type: 'PURCHASE', cardId: id, payment: buildPayment(me, CARDS[id]!, rnd) })
  }

  // 행동 A/B 후보 (§4.1 엄격 해석: 정확히 min(3, 남은 색 수), §4.2: 4개 이상)
  const takes: Action[] = []
  for (const c of GEM_COLORS) {
    if (s.supply[c] >= 4) takes.push({ type: 'TAKE_SAME', color: c })
  }
  const avail = GEM_COLORS.filter((c) => s.supply[c] > 0)
  const k = Math.min(3, avail.length)
  if (k > 0) {
    for (const combo of combinations(avail, k)) {
      takes.push({ type: 'TAKE_DIFFERENT', colors: combo })
    }
  }

  // 행동 C 후보 (§4.3: 예약 3장 미만, §9-E: 빈 덱은 비공개 예약 불가)
  const reserves: Action[] = []
  if (me.reserved.length < RULES_RESERVE_LIMIT) {
    for (const id of boardIds) reserves.push({ type: 'RESERVE_BOARD', cardId: id })
    for (const tier of [1, 2, 3] as const) {
      if (s.decks[tier - 1]!.length > 0) reserves.push({ type: 'RESERVE_DECK', tier })
    }
  }

  // 룰 도출 후보 전수 검증 — 엔진이 거부하면 과잉 거부(버그 후보)로 기록
  const vet = (list: readonly Action[]): Action[] =>
    list.filter((a) => {
      const v = validateAction(s, a)
      if (!v.ok) {
        reject(`${JSON.stringify(a)} → [${v.rule}] ${v.messageKo}`)
        return false
      }
      return true
    })

  const groups: (readonly Action[])[] = []
  const weights: number[] = []
  const vp = vet(purchases)
  const vt = vet(takes)
  const vr = vet(reserves)
  if (vp.length > 0) {
    groups.push(vp)
    weights.push(5)
  }
  if (vt.length > 0) {
    groups.push(vt)
    weights.push(3)
  }
  if (vr.length > 0) {
    groups.push(vr)
    weights.push(2)
  }
  if (groups.length === 0) return { type: 'PASS' } // §9-G: 합법 행동 공집합일 때만

  const totalW = weights.reduce((a, b) => a + b, 0)
  let r = rnd() * totalW
  let gi = 0
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!
    if (r < 0) {
      gi = i
      break
    }
  }
  return pick(rnd, groups[gi]!)
}

interface Step {
  readonly action: Action
  readonly state: GameState
}

interface Trace {
  readonly nPlayers: number
  readonly seed: number
  readonly initial: GameState
  readonly steps: readonly Step[]
  readonly rejections: readonly string[]
}

function runGame(nPlayers: number, seed: number, maxSteps: number): Trace {
  const initial = baseState(nPlayers, seed)
  const rnd = mulberry32(seed * 7919 + nPlayers * 104729 + 1)
  const steps: Step[] = []
  const rejections: string[] = []
  let s = initial
  while (s.phase.kind !== 'gameOver' && steps.length < maxSteps) {
    const action = chooseAction(s, rnd, (m) => rejections.push(`step ${steps.length}: ${m}`))
    const v = validateAction(s, action)
    if (!v.ok) {
      rejections.push(
        `step ${steps.length} (선택 액션): ${JSON.stringify(action)} → [${v.rule}] ${v.messageKo}`,
      )
      break
    }
    s = applyAction(s, action).state
    steps.push({ action, state: s })
  }
  return { nPlayers, seed, initial, steps, rejections }
}

const MAX_STEPS = 250
const SIMS: readonly (readonly [number, number])[] = [
  [2, 1],
  [2, 7],
  [2, 42],
  [3, 3],
  [4, 11],
]

const traceCache = new Map<string, Trace>()
function getTrace(nPlayers: number, seed: number): Trace {
  const key = `${nPlayers}:${seed}`
  let t = traceCache.get(key)
  if (!t) {
    t = runGame(nPlayers, seed, MAX_STEPS)
    traceCache.set(key, t)
  }
  return t
}

function forEachStep(trace: Trace, f: (label: string, s: GameState) => void): void {
  f(`[n=${trace.nPlayers} seed=${trace.seed} step=init]`, trace.initial)
  trace.steps.forEach((st, i) => {
    f(`[n=${trace.nPlayers} seed=${trace.seed} step=${i} act=${st.action.type}]`, st.state)
  })
}

// ────────────────────────────────────────────────────────────────────────────
// 보존 법칙 검사기 (기대값은 전부 RULES.md 기준)
// ────────────────────────────────────────────────────────────────────────────

/** §1/§2/§9-M: 색별 토큰 총량 보존 — 공급처 + 전원 소지 = 초기 총량 */
function expectTokenConservation(label: string, s: GameState, nPlayers: number): void {
  const gemInit = RULES_GEM_SUPPLY[nPlayers]!
  for (const c of TOKEN_COLORS) {
    const total = s.supply[c] + s.players.reduce((sum, p) => sum + p.tokens[c], 0)
    const want = c === 'gold' ? RULES_GOLD_SUPPLY : gemInit
    if (total !== want) {
      expect.fail(`${label} ${c} 총량 ${total} ≠ 초기 ${want} (§1/§2/§9-M 위반)`)
    }
  }
}

/** 토큰은 물리적 실물 — 음수·비정수는 어떤 지점에서도 불가 (§1) */
function expectNoNegatives(label: string, s: GameState): void {
  for (const c of TOKEN_COLORS) {
    const sv = s.supply[c]
    if (!Number.isInteger(sv) || sv < 0) {
      expect.fail(`${label} 공급처 ${c}=${sv} 음수/비정수 (§1 위반)`)
    }
    s.players.forEach((p, pi) => {
      const pv = p.tokens[c]
      if (!Number.isInteger(pv) || pv < 0) {
        expect.fail(`${label} P${pi} ${c}=${pv} 음수/비정수 (§1 위반)`)
      }
    })
  }
}

function collectAllCardIds(s: GameState): number[] {
  const ids: number[] = []
  for (const d of s.decks) ids.push(...d)
  for (const row of s.board) {
    for (const c of row) if (c !== null) ids.push(c)
  }
  for (const p of s.players) {
    ids.push(...p.purchased)
    for (const r of p.reserved) if (r.cardId >= 0) ids.push(r.cardId) // HIDDEN 제외
  }
  return ids
}

/** §1/§7: 카드 90장 분할 보존 — 덱+보드+구매+예약이 정확히 0..89 한 번씩 */
function expectCardPartition(label: string, s: GameState): void {
  const ids = collectAllCardIds(s).sort((a, b) => a - b)
  if (ids.length !== RULES_TOTAL_CARDS || ids.some((id, i) => id !== i)) {
    expect.fail(
      `${label} 카드 90장 분할 위반 (§1/§7): 수집 ${ids.length}장, 누락/중복=${JSON.stringify(
        ids.filter((id, i) => id !== i).slice(0, 5),
      )}`,
    )
  }
}

/** §3/§5.1/§6: bonuses·prestige 캐시가 purchased/nobles 재계산값과 일치 */
function expectCacheConsistency(label: string, s: GameState): void {
  s.players.forEach((p, pi) => {
    const b = recountBonuses(p)
    for (const c of GEM_COLORS) {
      if (p.bonuses[c] !== b[c]) {
        expect.fail(
          `${label} P${pi} bonuses[${c}] 캐시=${p.bonuses[c]} ≠ 재계산=${b[c]} (§5.1 위반)`,
        )
      }
    }
    const prestige = recountPrestige(p)
    if (p.prestige !== prestige) {
      expect.fail(`${label} P${pi} prestige 캐시=${p.prestige} ≠ 재계산=${prestige} (§3/§6 위반)`)
    }
  })
}

/** §5: discard phase 밖에서는 전원 ≤ 10, discard면 현재 플레이어 초과분 = mustDiscard */
function expectTokenLimit(label: string, s: GameState): void {
  const phase = s.phase
  s.players.forEach((p, pi) => {
    const total = tokenTotal(p.tokens)
    if (phase.kind === 'discard' && pi === s.currentPlayer) {
      if (phase.mustDiscard < 1 || phase.mustDiscard > 3) {
        expect.fail(`${label} mustDiscard=${phase.mustDiscard} 범위 밖 (§5: 한 턴 최대 +3)`)
      }
      if (total - RULES_TOKEN_LIMIT !== phase.mustDiscard) {
        expect.fail(
          `${label} P${pi} 초과분 ${total - RULES_TOKEN_LIMIT} ≠ mustDiscard ${phase.mustDiscard} (§5)`,
        )
      }
    } else if (total > RULES_TOKEN_LIMIT) {
      expect.fail(`${label} P${pi} 토큰 ${total} > ${RULES_TOKEN_LIMIT} (§5 위반)`)
    }
  })
}

/** §6: 귀족 타일은 보충되지 않고 중복 획득도 없다 — 공개+획득 = 초기 공개 집합 */
function expectNobleConservation(
  label: string,
  s: GameState,
  initialNobles: readonly NobleId[],
): void {
  const all = [...s.nobles, ...s.players.flatMap((p) => p.nobles)].sort((a, b) => a - b)
  const want = [...initialNobles].sort((a, b) => a - b)
  if (all.length !== want.length || all.some((id, i) => id !== want[i])) {
    expect.fail(
      `${label} 귀족 집합 위반 (§6): 현재=${JSON.stringify(all)} 초기=${JSON.stringify(want)}`,
    )
  }
}

/** §7: 항상 3×4 슬롯, 빈 슬롯은 해당 티어 덱이 소진됐을 때만 */
function expectBoardShape(label: string, s: GameState): void {
  if (s.board.length !== 3) expect.fail(`${label} 티어 행 수 ${s.board.length} ≠ 3 (§7)`)
  s.board.forEach((row, ti) => {
    if (row.length !== 4) expect.fail(`${label} 티어${ti + 1} 슬롯 ${row.length} ≠ 4 (§7)`)
    if (row.some((c) => c === null) && s.decks[ti]!.length > 0) {
      expect.fail(`${label} 티어${ti + 1} 덱이 남았는데 빈 슬롯 존재 (§7: 즉시 보충 위반)`)
    }
  })
}

/** §4.3: 예약은 전 구간 최대 3장 */
function expectReserveLimit(label: string, s: GameState): void {
  s.players.forEach((p, pi) => {
    if (p.reserved.length > RULES_RESERVE_LIMIT) {
      expect.fail(`${label} P${pi} 예약 ${p.reserved.length}장 > ${RULES_RESERVE_LIMIT} (§4.3)`)
    }
  })
}

function checkAllInvariants(
  label: string,
  s: GameState,
  nPlayers: number,
  initialNobles: readonly NobleId[],
): void {
  expectNoNegatives(label, s)
  expectTokenConservation(label, s, nPlayers)
  expectCardPartition(label, s)
  expectCacheConsistency(label, s)
  expectTokenLimit(label, s)
  expectNobleConservation(label, s, initialNobles)
  expectBoardShape(label, s)
  expectReserveLimit(label, s)
}

// ────────────────────────────────────────────────────────────────────────────
// 공격 테스트
// ────────────────────────────────────────────────────────────────────────────

describe('보존 법칙·상태 정합 공격 (RULES.md 전 조항 횡단)', () => {
  it('§1/§2 셋업 앵커 — 인원별 토큰 총량·카드 90장·귀족 n+1·덱 36/26/16이 룰 표와 일치한다', () => {
    for (const [n, gemCount] of [
      [2, 4],
      [3, 5],
      [4, 7],
    ] as const) {
      const s = baseState(n, 101)
      for (const c of GEM_COLORS) {
        expect(s.supply[c], `${n}인 보석 ${c} (§2 표)`).toBe(gemCount)
      }
      expect(s.supply.gold, `${n}인 황금 (§2 "황금은 건드리지 않는다")`).toBe(RULES_GOLD_SUPPLY)
      const ids = collectAllCardIds(s)
      expect(ids.length, '§1 개발 카드 총 90장').toBe(RULES_TOTAL_CARDS)
      expect(new Set(ids).size, '§1 카드 중복 없음').toBe(RULES_TOTAL_CARDS)
      expect(s.nobles.length, '§2-3 공개 귀족 = 인원+1').toBe(n + 1)
      s.board.forEach((row, ti) => {
        expect(row.length, `§2-2 티어${ti + 1} 공개 4장`).toBe(4)
        expect(row.every((c) => c !== null), `§2-2 티어${ti + 1} 빈 슬롯 없음`).toBe(true)
      })
      // §1 카드 40/30/20장 − §2-2 공개 4장 = 덱 36/26/16장
      expect(s.decks[0]!.length, '§1/§2 티어1 덱').toBe(36)
      expect(s.decks[1]!.length, '§1/§2 티어2 덱').toBe(26)
      expect(s.decks[2]!.length, '§1/§2 티어3 덱').toBe(16)
      for (const p of s.players) expect(tokenTotal(p.tokens), '플레이어 빈손 시작').toBe(0)
    }
  })

  it('§1+§9-M 토큰 색별 총량 보존 — 장기 무작위 합법 시퀀스의 매 수에서 공급처+전원 소지 = 초기 총량', () => {
    for (const [n, seed] of SIMS) {
      const t = getTrace(n, seed)
      expect(t.steps.length, `[n=${n} seed=${seed}] 20수 이상 진행`).toBeGreaterThanOrEqual(20)
      forEachStep(t, (label, s) => {
        expectNoNegatives(label, s)
        expectTokenConservation(label, s, n)
      })
    }
  }, 60_000)

  it('§1+§7 카드 90장 분할 보존 — 매 수에서 덱+보드+구매+예약(HIDDEN 제외)이 정확히 0..89 한 번씩이다', () => {
    for (const [n, seed] of SIMS) {
      forEachStep(getTrace(n, seed), (label, s) => expectCardPartition(label, s))
    }
  }, 60_000)

  it('§3+§5.1+§6 파생값 캐시 정합 — bonuses/prestige가 purchased+nobles 재계산값과 매 수 일치한다', () => {
    for (const [n, seed] of SIMS) {
      forEachStep(getTrace(n, seed), (label, s) => expectCacheConsistency(label, s))
    }
  }, 60_000)

  it('§5 토큰 10개 상한 — discard phase 밖에서는 전원 ≤ 10, discard phase에서는 초과분 = mustDiscard', () => {
    for (const [n, seed] of SIMS) {
      forEachStep(getTrace(n, seed), (label, s) => expectTokenLimit(label, s))
    }
  }, 60_000)

  it('§6 귀족 타일 보존 — 공개+획득 귀족이 초기 공개 집합과 항상 일치하고 보충·중복이 없다', () => {
    for (const [n, seed] of SIMS) {
      const t = getTrace(n, seed)
      forEachStep(t, (label, s) => expectNobleConservation(label, s, t.initial.nobles))
    }
  }, 60_000)

  it('§7 보드 형태 보존 — 항상 3×4 슬롯이며 빈 슬롯은 해당 티어 덱 소진 시에만 존재한다', () => {
    for (const [n, seed] of SIMS) {
      forEachStep(getTrace(n, seed), (label, s) => expectBoardShape(label, s))
    }
  }, 60_000)

  it('§4.3 예약 상한 보존 — 전 구간 모든 플레이어 reserved ≤ 3', () => {
    for (const [n, seed] of SIMS) {
      forEachStep(getTrace(n, seed), (label, s) => expectReserveLimit(label, s))
    }
  }, 60_000)

  it('§4 엔진 과잉 거부 탐지 — RULES에서 도출한 합법 후보가 validateAction에서 거부되지 않는다', () => {
    let purchases = 0
    let takes = 0
    let reserves = 0
    let discards = 0
    for (const [n, seed] of SIMS) {
      const t = getTrace(n, seed)
      expect(t.rejections, `[n=${n} seed=${seed}] 엔진이 거부한 룰 도출 합법 후보`).toEqual([])
      for (const st of t.steps) {
        if (st.action.type === 'PURCHASE') purchases++
        else if (st.action.type === 'TAKE_DIFFERENT' || st.action.type === 'TAKE_SAME') takes++
        else if (st.action.type === 'RESERVE_BOARD' || st.action.type === 'RESERVE_DECK') reserves++
        else if (st.action.type === 'DISCARD') discards++
      }
    }
    // 공격 커버리지 확인: 4대 행동 + 반납 경로가 실제로 밟혔는가
    expect(purchases, '시퀀스에 구매(§4.4)가 포함되어야 공격이 유효').toBeGreaterThan(0)
    expect(takes, '시퀀스에 토큰 획득(§4.1/§4.2) 포함').toBeGreaterThan(0)
    expect(reserves, '시퀀스에 예약(§4.3) 포함').toBeGreaterThan(0)
    expect(discards, '시퀀스에 반납(§5) 포함').toBeGreaterThan(0)
  }, 60_000)

  it('§횡단 프로퍼티(fast-check) — 임의 시드·인원에서 20수 이상 진행하며 모든 보존 법칙이 동시에 성립한다', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.constantFrom(2, 3, 4),
        (seed, nPlayers) => {
          const t = runGame(nPlayers, seed, 100)
          expect(t.rejections, `seed=${seed} 엔진 과잉 거부`).toEqual([])
          const ended = t.steps.at(-1)?.state.phase.kind === 'gameOver'
          expect(
            t.steps.length >= 20 || ended,
            `seed=${seed} 게임 종료 없이 ${t.steps.length}수에서 멈춤`,
          ).toBe(true)
          forEachStep(t, (label, s) => checkAllInvariants(label, s, nPlayers, t.initial.nobles))
        },
      ),
      { numRuns: 12 },
    )
  }, 120_000)
})

describe('보존 법칙 정조준 시나리오 (RULES.md 경계 사례)', () => {
  it('§9-H+§5 토큰 10개에서 예약 → 황금으로 11개 → 방금 받은 황금 반납 — 황금 총량 5가 전 과정 보존된다', () => {
    // 우주 일관성: 2인 공급 4/색에서 플레이어에게 2/색을 옮겨 놓는다 (총량 = 룰 표 유지)
    let s = baseState(2, 5, {
      supply: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2, gold: 5 }),
    })
    s = patchPlayer(s, 0, {
      tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }),
    })
    const goldTotal = (st: GameState) =>
      st.supply.gold + st.players.reduce((a, p) => a + p.tokens.gold, 0)
    expect(goldTotal(s), '§1 시작 황금 총량').toBe(RULES_GOLD_SUPPLY)

    const target = s.board[0]![0]!
    const mid = applyAction(s, { type: 'RESERVE_BOARD', cardId: target }).state
    expect(mid.phase, '§9-H: 11개가 되어 즉시 반납 단계').toEqual({ kind: 'discard', mustDiscard: 1 })
    expect(mid.players[0]!.tokens.gold, '§4.3 예약과 동시에 황금 1개').toBe(1)
    expect(tokenTotal(mid.players[0]!.tokens)).toBe(11)
    expect(goldTotal(mid), '§1 황금 총량 5 보존 (획득 시점)').toBe(RULES_GOLD_SUPPLY)
    expectCardPartition('[§9-H mid]', mid)

    // §5: 방금 받은 황금을 그대로 반납해도 된다
    const done = applyAction(mid, { type: 'DISCARD', tokens: tokens({ gold: 1 }) }).state
    expect(goldTotal(done), '§1/§5 반납 후 황금 총량 5').toBe(RULES_GOLD_SUPPLY)
    expect(done.supply.gold, '§5 반납 토큰은 공급처로').toBe(5)
    expect(tokenTotal(done.players[0]!.tokens), '§5 턴 종료 시 10개').toBe(10)
    expect(done.players[0]!.reserved.length, '§4.3 예약은 유효하게 성립').toBe(1)
    expect(done.phase).toEqual({ kind: 'play' })
    expect(done.currentPlayer, '턴이 다음 플레이어로 넘어간다').toBe(1)
    expectTokenConservation('[§9-H done]', done, 2)
    expectCardPartition('[§9-H done]', done)
  })

  it('§9-L+§9-M 보석 보유 중 황금 대체 지불 — 지불 토큰 전액이 공급처로 정확히 회수된다', () => {
    const card = findCard((c) => c.tier === 1 && c.cost.blue >= 1)
    let s = baseState(2, 9)
    s = placeOnBoard(s, card.id)
    // 비용 전액 + 황금 1개를 공급처에서 플레이어로 옮긴다 (우주 총량 유지)
    const grant = tokens({ ...card.cost, gold: 1 })
    s = patchPlayer({ ...s, supply: subtractTokens(s.supply, grant) }, 0, { tokens: grant })

    // §9-L: 파랑 보석을 갖고 있어도 그 1개 자리에 황금을 대신 지불
    const payment = tokens({ ...card.cost, blue: card.cost.blue - 1, gold: 1 })
    const action: Action = { type: 'PURCHASE', cardId: card.id, payment }
    expect(validateAction(s, action).ok, '§9-L 황금 대체 지불은 합법이어야 한다').toBe(true)

    const supplyBefore = s.supply
    const after = applyAction(s, action).state
    expect(after.supply, '§9-M 지불 토큰(황금 포함) 전액 공급처 회수').toEqual(
      addTokens(supplyBefore, payment),
    )
    expect(after.players[0]!.tokens, '지불 후 잔여 토큰 = 파랑 1').toEqual(tokens({ blue: 1 }))
    expect(after.players[0]!.purchased, '구매 카드 목록에 추가').toContain(card.id)
    expectTokenConservation('[§9-L]', after, 2)
    expectCardPartition('[§9-L]', after)
    expectCacheConsistency('[§9-L]', after)
    expect(after.currentPlayer, '턴 종료 (반납·귀족 해당 없음)').toBe(1)
  })

  it('§5 토큰 색 교환(3개 획득 + 다른 색 3개 반납) — 색별 총량 보존과 턴 종료 10개 유지', () => {
    let s = baseState(2, 13, {
      supply: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2, gold: 5 }),
    })
    s = patchPlayer(s, 0, {
      tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }),
    })

    const mid = applyAction(s, {
      type: 'TAKE_DIFFERENT',
      colors: ['white', 'blue', 'green'],
    }).state
    expect(mid.phase, '§5: 13개 → 3개 반납 단계').toEqual({ kind: 'discard', mustDiscard: 3 })
    expectTokenConservation('[§5-swap mid]', mid, 2)

    // §5 [FAQ]: 반납은 자유 선택 — 방금 가져온 색이 아닌 다른 색을 반납해 색 교환
    const done = applyAction(mid, { type: 'DISCARD', tokens: tokens({ red: 2, black: 1 }) }).state
    expect(tokenTotal(done.players[0]!.tokens), '§5 턴 종료 시 정확히 10개').toBe(10)
    expect(done.players[0]!.tokens, '색 교환 결과').toEqual(
      tokens({ white: 3, blue: 3, green: 3, black: 1 }),
    )
    expect(done.supply, '§5 반납분은 공급처 해당 색 더미로').toEqual(
      tokens({ white: 1, blue: 1, green: 1, red: 4, black: 3, gold: 5 }),
    )
    expectTokenConservation('[§5-swap done]', done, 2)
    expect(done.currentPlayer).toBe(1)
  })
})
