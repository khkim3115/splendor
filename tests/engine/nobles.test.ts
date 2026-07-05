import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { NOBLES } from '../../src/engine/data/nobles'
import { IllegalActionError } from '../../src/engine/errors'
import { baseState, gems, patchPlayer, tokens } from '../helpers'

const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다')
}

// 생성 데이터 기준: 귀족 0 = {red:4, black:4}, 귀족 1 = {green:3, red:3, black:3}
const NOBLE_A = 0
const NOBLE_B = 1

describe('§6 귀족 방문', () => {
  it('데이터 전제 확인: 테스트가 가정하는 귀족 요구 조건', () => {
    expect(NOBLES[NOBLE_A]!.requirement).toEqual(gems({ red: 4, black: 4 }))
    expect(NOBLES[NOBLE_B]!.requirement).toEqual(gems({ green: 3, red: 3, black: 3 }))
  })

  it('§6: 단일 충족 시 턴 종료에 자동 수여된다 — 비용 없음, 보너스 소모 없음, 3점', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A] })
    s = patchPlayer(s, 0, { bonuses: gems({ red: 4, black: 4 }) })
    const { state, events } = applyAction(s, { type: 'TAKE_SAME', color: 'red' })

    const p = state.players[0]!
    expect(p.nobles).toEqual([NOBLE_A])
    expect(p.prestige).toBe(3)
    expect(p.bonuses).toEqual(gems({ red: 4, black: 4 })) // 소모되지 않음
    expect(state.nobles).toEqual([]) // 보충되지 않음 (§6)
    expect(events.map((e) => e.t)).toEqual(['tokensTaken', 'nobleVisited', 'turnEnded'])
    const e = events[1]!
    expect(e.t === 'nobleVisited' && e.auto).toBe(true)
  })

  it('§9-J: 복수 충족 시 chooseNoble phase — 플레이어가 1장 선택, 나머지는 남는다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B] })
    s = patchPlayer(s, 0, { bonuses: gems({ green: 3, red: 4, black: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_SAME', color: 'red' })

    expect(mid.state.phase).toEqual({ kind: 'chooseNoble', options: [NOBLE_A, NOBLE_B] })
    expect(mid.events.map((e) => e.t)).toEqual(['tokensTaken']) // 턴이 아직 안 끝났다

    const after = applyAction(mid.state, { type: 'CHOOSE_NOBLE', nobleId: NOBLE_B })
    expect(after.state.players[0]!.nobles).toEqual([NOBLE_B])
    expect(after.state.players[0]!.prestige).toBe(3)
    expect(after.state.nobles).toEqual([NOBLE_A]) // 남은 귀족은 테이블에
    expect(after.events.map((e) => e.t)).toEqual(['nobleVisited', 'turnEnded'])
    const e = after.events[0]!
    expect(e.t === 'nobleVisited' && e.auto).toBe(false)
  })

  it('§9-J: 조건을 충족한 귀족 외에는 선택할 수 없다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B] })
    s = patchPlayer(s, 0, { bonuses: gems({ green: 3, red: 4, black: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(ruleOf(() => applyAction(mid.state, { type: 'CHOOSE_NOBLE', nobleId: 7 }))).toBe(
      '§9-J',
    )
  })

  it('§6: play phase에서의 CHOOSE_NOBLE은 거부된다', () => {
    const s = baseState(2)
    expect(ruleOf(() => applyAction(s, { type: 'CHOOSE_NOBLE', nobleId: 0 }))).toBe('§6')
  })

  it('§6 [구현 결정] 순서: 토큰 반납(§5) 후에 귀족 판정이 이뤄진다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A] })
    s = patchPlayer(s, 0, {
      tokens: tokens({ white: 4, blue: 4, green: 2 }), // 10개
      bonuses: gems({ red: 4, black: 4 }),
    })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })
    expect(mid.events.some((e) => e.t === 'nobleVisited')).toBe(false) // 아직 귀족 판정 전

    const after = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 3 }) })
    expect(after.events.map((e) => e.t)).toEqual(['tokensReturned', 'nobleVisited', 'turnEnded'])
    expect(after.state.players[0]!.nobles).toEqual([NOBLE_A])
  })

  it('§6: 한 턴에 1장만 — 남은 귀족은 다음 자기 턴 종료에 자동 수여된다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B] })
    s = patchPlayer(s, 0, { bonuses: gems({ green: 3, red: 4, black: 4 }) })

    const t1 = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    const t2 = applyAction(t1.state, { type: 'CHOOSE_NOBLE', nobleId: NOBLE_A })
    expect(t2.state.currentPlayer).toBe(1)

    const t3 = applyAction(t2.state, { type: 'TAKE_SAME', color: 'blue' }) // 상대 턴
    const t4 = applyAction(t3.state, { type: 'TAKE_SAME', color: 'green' }) // 내 다음 턴
    const p = t4.state.players[0]!
    expect(p.nobles).toEqual([NOBLE_A, NOBLE_B]) // 남은 귀족 자동 수여
    expect(p.prestige).toBe(6)
  })
})
