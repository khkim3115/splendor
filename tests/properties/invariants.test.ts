// 프로퍼티 테스트 (docs/ARCHITECTURE.md §6-3)
// 무작위 시드 + legalActions에서 무작위 선택으로 게임을 완주하며 매 스텝 불변식을 검사한다.

import * as fc from 'fast-check'
import { afterAll, describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { CARDS } from '../../src/engine/data/cards'
import { NOBLES } from '../../src/engine/data/nobles'
import { setStateFreezing } from '../../src/engine/freeze'
import { isLegal, legalActions } from '../../src/engine/legal'
import { canonicalPayment } from '../../src/engine/payment'
import { hashState, replay } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import { tokenTotal } from '../../src/engine/tokens'
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type Action,
  type GameState,
  type TokenMap,
} from '../../src/engine/types'
import { config } from '../helpers'

const MAX_STEPS = 3000

interface GameRun {
  readonly finalState: GameState
  readonly log: readonly Action[]
}

/** legalActions에서 시드 기반으로 무작위 선택하며 완주 */
function playRandomGame(
  seed: number,
  onStep?: (s: GameState, legal: readonly Action[], step: number) => void,
): GameRun {
  const playerCount = 2 + (seed % 3)
  let s = setupGame(config(playerCount, seed))
  let rng: RngState = createRng(seed ^ 0x51ed270b)
  const log: Action[] = []

  for (let step = 0; step < MAX_STEPS; step++) {
    if (s.phase.kind === 'gameOver') return { finalState: s, log }
    const legal = legalActions(s)
    onStep?.(s, legal, step)
    const [i, next] = nextInt(rng, legal.length)
    rng = next
    const action = legal[i]!
    s = applyAction(s, action).state
    log.push(action)
  }
  throw new Error(`시드 ${seed}: ${MAX_STEPS}수 내에 게임이 종료되지 않았습니다`)
}

/** 상태 불변식 전체 검사 */
function checkInvariants(s: GameState, initialSupply: TokenMap): void {
  // 보존: 색별 (공급처 + 전원 소지) = 초기 총량
  for (const c of TOKEN_COLORS) {
    const total = s.supply[c] + s.players.reduce((sum, p) => sum + p.tokens[c], 0)
    expect(total, `토큰 보존 위반: ${c}`).toBe(initialSupply[c])
    expect(s.supply[c], `공급처 음수: ${c}`).toBeGreaterThanOrEqual(0)
    for (const p of s.players) {
      expect(p.tokens[c], `플레이어 토큰 음수: ${c}`).toBeGreaterThanOrEqual(0)
    }
  }

  // 카드 90장 분할 보존: 덱 + 보드 + 구매 + 예약 = 정확히 0..89
  const ids = [
    ...s.decks.flat(),
    ...s.board.flat().filter((c): c is number => c !== null),
    ...s.players.flatMap((p) => p.purchased),
    ...s.players.flatMap((p) => p.reserved.map((r) => r.cardId)),
  ].sort((a, b) => a - b)
  expect(ids.length, '카드 분할 크기').toBe(90)
  for (let i = 0; i < 90; i++) {
    expect(ids[i], `카드 분할 누락/중복: ${i}`).toBe(i)
  }

  // 파생값 캐시 = purchased/nobles 재계산값
  for (const [pi, p] of s.players.entries()) {
    const bonuses = { white: 0, blue: 0, green: 0, red: 0, black: 0 }
    let prestige = 0
    for (const id of p.purchased) {
      bonuses[CARDS[id]!.bonus]++
      prestige += CARDS[id]!.points
    }
    for (const nid of p.nobles) prestige += NOBLES[nid]!.points
    expect(p.bonuses, `P${pi} bonuses 캐시 불일치`).toEqual(bonuses)
    expect(p.prestige, `P${pi} prestige 캐시 불일치`).toBe(prestige)
    expect(p.reserved.length, `P${pi} 예약 한도`).toBeLessThanOrEqual(3)
  }

  // §5: discard phase 밖에서는 전원 토큰 ≤ 10
  if (s.phase.kind !== 'discard') {
    for (const [pi, p] of s.players.entries()) {
      expect(tokenTotal(p.tokens), `P${pi} 토큰 한도`).toBeLessThanOrEqual(10)
    }
  }
}

/** isLegal ⟺ legalActions 멤버십 동치 검사용 후보 생성 */
function candidateActions(s: GameState): Action[] {
  const out: Action[] = [{ type: 'PASS' }]
  for (const c of GEM_COLORS) out.push({ type: 'TAKE_SAME', color: c })
  // 크기 1~3의 모든 서로 다른 색 조합
  for (let i = 0; i < 5; i++) {
    out.push({ type: 'TAKE_DIFFERENT', colors: [GEM_COLORS[i]!] })
    for (let j = i + 1; j < 5; j++) {
      out.push({ type: 'TAKE_DIFFERENT', colors: [GEM_COLORS[i]!, GEM_COLORS[j]!] })
      for (let k = j + 1; k < 5; k++) {
        out.push({
          type: 'TAKE_DIFFERENT',
          colors: [GEM_COLORS[i]!, GEM_COLORS[j]!, GEM_COLORS[k]!],
        })
      }
    }
  }
  for (const tier of [1, 2, 3] as const) out.push({ type: 'RESERVE_DECK', tier })
  const player = s.players[s.currentPlayer]!
  for (const row of s.board) {
    for (const id of row) {
      if (id !== null) {
        out.push({ type: 'RESERVE_BOARD', cardId: id })
        out.push({ type: 'PURCHASE', cardId: id, payment: canonicalPayment(player, CARDS[id]!) })
      }
    }
  }
  for (const r of player.reserved) {
    if (r.cardId >= 0) {
      out.push({
        type: 'PURCHASE',
        cardId: r.cardId,
        payment: canonicalPayment(player, CARDS[r.cardId]!),
      })
    }
  }
  return out
}

const keyOf = (a: Action): string => {
  switch (a.type) {
    case 'TAKE_DIFFERENT':
      return `TD:${[...a.colors].sort().join(',')}`
    case 'TAKE_SAME':
      return `TS:${a.color}`
    case 'RESERVE_BOARD':
      return `RB:${a.cardId}`
    case 'RESERVE_DECK':
      return `RD:${a.tier}`
    case 'PURCHASE':
      return `P:${a.cardId}:${JSON.stringify(a.payment)}`
    case 'DISCARD':
      return `D:${JSON.stringify(a.tokens)}`
    case 'CHOOSE_NOBLE':
      return `CN:${a.nobleId}`
    case 'PASS':
      return 'PASS'
  }
}

describe('프로퍼티: 무작위 완주 불변식', () => {
  afterAll(() => setStateFreezing(true))

  it('전 phase 완전성·보존 법칙·파생값·한도 (fast-check 120회)', { timeout: 120_000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        const playerCount = 2 + (seed % 3)
        const initialSupply = setupGame(config(playerCount, seed)).supply
        let prevNobles = Infinity

        playRandomGame(seed, (s, legal, step) => {
          // 완전성 불변식 (전 phase 예외 없음)
          expect(legal.length, `phase=${s.phase.kind}에서 legalActions 공집합`).toBeGreaterThan(0)
          expect(s.nobles.length).toBeLessThanOrEqual(prevNobles)
          prevNobles = s.nobles.length
          checkInvariants(s, initialSupply)

          // 7스텝마다: 모든 합법 수가 isLegal이고 throw 없이 적용된다
          if (step % 7 === 0) {
            for (const a of legal) {
              expect(isLegal(s, a), `legalActions 원소가 isLegal=false: ${keyOf(a)}`).toBe(true)
              applyAction(s, a) // throw하면 프로퍼티 실패
            }
          }
        })
      }),
      { numRuns: 120 },
    )
  })

  it('동치성: isLegal(a) ⟺ a ∈ legalActions (play phase, 표본 상태)', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7fffffff }), (seed) => {
        playRandomGame(seed, (s, legal, step) => {
          if (s.phase.kind !== 'play' || step % 11 !== 0) return
          const inList = new Set(legal.map(keyOf))
          for (const cand of candidateActions(s)) {
            const legal_ = isLegal(s, cand)
            const member = inList.has(keyOf(cand))
            expect(
              legal_,
              `동치성 위반 (${legal_ ? '합법인데 미열거' : '불법인데 열거됨'}): ${keyOf(cand)}`,
            ).toBe(member)
          }
        })
      }),
      { numRuns: 40 },
    )
  })

  it('결정론: 같은 (config, actions) → replay 최종 해시 동일 (30판)', { timeout: 60_000 }, () => {
    for (let seed = 0; seed < 30; seed++) {
      const { finalState, log } = playRandomGame(seed)
      const playerCount = 2 + (seed % 3)
      expect(hashState(replay(config(playerCount, seed), [...log]))).toBe(hashState(finalState))
    }
  })

  it('종결성: 랜덤 에이전트 1,000판 전부 정상 종료', { timeout: 60_000 }, () => {
    setStateFreezing(false) // 대량 실행 — dev 동결 가드만 끈다 (엔진 로직은 동일)
    try {
      for (let seed = 0; seed < 1000; seed++) {
        const { finalState } = playRandomGame(seed * 7919 + 13)
        expect(finalState.phase.kind).toBe('gameOver')
      }
    } finally {
      setStateFreezing(true)
    }
  })
})
