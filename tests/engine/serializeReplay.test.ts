import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { deserialize, hashState, replay, serialize } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import type { Action } from '../../src/engine/types'
import { config } from '../helpers'

const SCRIPT: readonly Action[] = [
  { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'blue'] },
  { type: 'TAKE_SAME', color: 'white' },
  { type: 'RESERVE_DECK', tier: 1 },
  { type: 'TAKE_DIFFERENT', colors: ['black', 'white', 'blue'] },
  { type: 'RESERVE_BOARD', cardId: -999 }, // 자리 표시 — 아래에서 실제 카드로 대체
]

describe('직렬화 · 리플레이', () => {
  it('serialize → deserialize 라운드트립 후 hashState가 유지된다', () => {
    const s = setupGame(config(3, 42))
    const restored = deserialize(serialize(s))
    expect(hashState(restored)).toBe(hashState(s))
  })

  it('복원된 상태에 이어서 적용해도 원본 경로와 동일한 해시를 낸다', () => {
    let a = setupGame(config(2, 7))
    let b = deserialize(serialize(a))
    const action: Action = { type: 'TAKE_SAME', color: 'red' }
    a = applyAction(a, action).state
    b = applyAction(b, action).state
    expect(hashState(b)).toBe(hashState(a))
  })

  it('replay(config, actions)가 순차 applyAction과 hashState 동일하다', () => {
    const cfg = config(2, 42)
    let s = setupGame(cfg)
    const log: Action[] = []
    const script = SCRIPT.slice(0, 4)
    for (const a of script) {
      s = applyAction(s, a).state
      log.push(a)
    }
    // 다섯 번째 수: 현재 보드의 실제 카드를 예약
    const fifth: Action = { type: 'RESERVE_BOARD', cardId: s.board[1]![0]! }
    s = applyAction(s, fifth).state
    log.push(fifth)

    expect(hashState(replay(cfg, log))).toBe(hashState(s))
  })

  it('deserialize는 손상된 데이터를 명확한 오류로 거부한다', () => {
    for (const bad of ['null', '{}', '[]', '{"players":[]}', '{"players":[{},{}]}']) {
      expect(() => deserialize(bad), bad).toThrow(/세이브 데이터/)
    }
  })

  it('deserialize는 필드 단위 손상을 전부 즉시 거부한다 (지연 크래시·조용한 오염 방지)', () => {
    const base = () => JSON.parse(serialize(setupGame(config(2, 5)))) as Record<string, never>
    const corruptions: readonly [string, (s: Record<string, unknown>) => void][] = [
      ['phase.kind 미상', (s) => (s.phase = { kind: 'weird' })],
      ['phase 빈 객체', (s) => (s.phase = {})],
      ['discard.mustDiscard 누락', (s) => (s.phase = { kind: 'discard' })],
      ['chooseNoble.options 누락', (s) => (s.phase = { kind: 'chooseNoble' })],
      ['플레이어 tokens.gold 키 누락', (s) => {
        delete ((s.players as Record<string, unknown>[])[0]!.tokens as Record<string, unknown>).gold
      }],
      ['players 원소 null', (s) => ((s.players as unknown[])[1] = null)],
      ['currentPlayer 범위 밖', (s) => (s.currentPlayer = 9)],
      ['supply 음수', (s) => ((s.supply as Record<string, number>).red = -3)],
      ['decks 원소 null', (s) => (s.decks = [null, [], []])],
      ['board에 범위 밖 카드', (s) => {
        const b = s.board as (number | null)[][]
        b[0]![0] = 999
      }],
      ['nobles 필드 삭제', (s) => delete (s as Record<string, unknown>).nobles],
      ['config 삭제', (s) => delete (s as Record<string, unknown>).config],
      ['config.seed 누락', (s) => (s.config = { players: (s.config as Record<string, unknown>).players })],
      ['카드 분할 파괴 (덱 카드 복제)', (s) => {
        const decks = s.decks as number[][]
        decks[0]![0] = decks[0]![1]!
      }],
      ['토큰 보존 파괴', (s) => ((s.supply as Record<string, number>).red = 7)],
      ['turn 비정수', (s) => (s.turn = 'x')],
      ['finalRound 비불리언', (s) => (s.finalRound = 1)],
      ['config.players 비배열', (s) => (((s.config as Record<string, unknown>).players = 'x'))],
      ['config.players[0] null', (s) => (((s.config as Record<string, unknown>).players as unknown[])[0] = null)],
      ['config.players[0].name 비문자열', (s) => {
        const p0 = ((s.config as Record<string, unknown>).players as Record<string, unknown>[])[0]!
        p0.name = 42
      }],
      ['config.players[0].type 미상', (s) => {
        const p0 = ((s.config as Record<string, unknown>).players as Record<string, unknown>[])[0]!
        p0.type = 'robot'
      }],
      ['config.players[0] ai difficulty 미상', (s) => {
        const p0 = ((s.config as Record<string, unknown>).players as Record<string, unknown>[])[0]!
        p0.type = 'ai'
        p0.difficulty = 'insane'
      }],
      ['supply 키 누락', (s) => delete (s.supply as Record<string, unknown>).gold],
      ['players[0].tokens null', (s) => (((s.players as Record<string, unknown>[])[0]!.tokens = null))],
      ['players[0].bonuses 키 누락', (s) => {
        delete ((s.players as Record<string, unknown>[])[0]!.bonuses as Record<string, unknown>).red
      }],
      ['players[0].purchased 범위 밖', (s) => (((s.players as Record<string, unknown>[])[0]!.purchased = [999]))],
      ['players[0].nobles 범위 밖', (s) => (((s.players as Record<string, unknown>[])[0]!.nobles = [99]))],
      ['players[0].reserved 4장', (s) => {
        ;(s.players as Record<string, unknown>[])[0]!.reserved = [
          { cardId: 1, fromDeck: true },
          { cardId: 2, fromDeck: true },
          { cardId: 3, fromDeck: true },
          { cardId: 4, fromDeck: true },
        ]
      }],
      ['players[0].reserved 원소 형태 오류', (s) => {
        ;(s.players as Record<string, unknown>[])[0]!.reserved = [{ cardId: 'x', fromDeck: true }]
      }],
      ['players[0].reserved fromDeck 누락', (s) => {
        ;(s.players as Record<string, unknown>[])[0]!.reserved = [{ cardId: 1 }]
      }],
      ['players[0].prestige 음수', (s) => (((s.players as Record<string, unknown>[])[0]!.prestige = -1))],
      ['decks 원소에 범위 밖 카드', (s) => (((s.decks as number[][])[0]![0] = -5))],
      ['board 행 길이 3', (s) => (((s.board as unknown[])[0] = [1, 2, 3]))],
      ['board 행 null', (s) => (((s.board as unknown[])[0] = null))],
      ['nobles 범위 밖', (s) => (s.nobles = [99])],
      ['startPlayer 범위 밖', (s) => (s.startPlayer = -1)],
      ['turn 음수', (s) => (s.turn = -1)],
      ['phase.options 빈 배열', (s) => (s.phase = { kind: 'chooseNoble', options: [] })],
      ['phase.options 범위 밖', (s) => (s.phase = { kind: 'chooseNoble', options: [99] })],
      ['gameOver result 비객체', (s) => (s.phase = { kind: 'gameOver', result: null })],
      ['gameOver winners 비배열', (s) => {
        s.phase = { kind: 'gameOver', result: { winners: null, scores: [], reason: 'prestige15' } }
      }],
      ['gameOver reason 미상', (s) => {
        s.phase = { kind: 'gameOver', result: { winners: [0], scores: [], reason: 'weird' } }
      }],
    ]
    for (const [name, corrupt] of corruptions) {
      const s = base() as Record<string, unknown>
      corrupt(s)
      expect(() => deserialize(JSON.stringify(s)), name).toThrow(/세이브 데이터/)
    }
  })

  it('deserialize 산출물은 dev 동결되어 로드 직후 변이가 즉시 드러난다', () => {
    const restored = deserialize(serialize(setupGame(config(2, 5))))
    expect(Object.isFrozen(restored)).toBe(true)
    expect(Object.isFrozen(restored.supply)).toBe(true)
    expect(Object.isFrozen(restored.players[0])).toBe(true)
  })
})
