// 골든 리플레이 (docs/ARCHITECTURE.md §6-4)
// (config, actions[], 체크포인트 해시, 최종 해시)를 고정해 엔진 회귀를 잡는다.
// 버그 발견 시 재현 액션 열을 리플레이로 추가하는 것이 픽스의 필수 절차 (docs/ROADMAP.md 운영 규약).
//
// 재생성/추가 채집: GEN_REPLAYS=1 npx vitest run tests/replays
// (기존 골든 파일을 덮어쓰므로, 의도적 룰 변경이 아니라면 재생성하지 말 것)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { legalActions, validateAction } from '../../src/engine/legal'
import { hashState } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import type { Action, GameConfig, GameState } from '../../src/engine/types'
import { config } from '../helpers'

const DIR = dirname(fileURLToPath(import.meta.url))
const CHECKPOINT_INTERVAL = 20

interface ReplayFile {
  readonly name: string
  readonly config: GameConfig
  readonly actions: readonly Action[]
  readonly checkpoints: readonly { readonly index: number; readonly hash: string }[]
  readonly finalHash: string
}

const replayFiles = readdirSync(DIR).filter((f) => f.endsWith('.replay.json'))

describe('골든 리플레이', () => {
  it.runIf(process.env.GEN_REPLAYS === '1')('리플레이 채집 (GEN_REPLAYS=1)', () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const playerCount = 2 + (seed % 3)
      const cfg = config(playerCount, seed)
      let s: GameState = setupGame(cfg)
      let rng: RngState = createRng(seed ^ 0x2545f491)
      const actions: Action[] = []
      const checkpoints: { index: number; hash: string }[] = []

      while (s.phase.kind !== 'gameOver') {
        const legal = legalActions(s)
        const [i, next] = nextInt(rng, legal.length)
        rng = next
        s = applyAction(s, legal[i]!).state
        actions.push(legal[i]!)
        if (actions.length % CHECKPOINT_INTERVAL === 0) {
          checkpoints.push({ index: actions.length, hash: hashState(s) })
        }
        if (actions.length > 5000) throw new Error('리플레이 채집 실패: 게임이 끝나지 않음')
      }

      const file: ReplayFile = {
        name: `random-seed${seed}`,
        config: cfg,
        actions,
        checkpoints,
        finalHash: hashState(s),
      }
      writeFileSync(join(DIR, `random-seed${seed}.replay.json`), JSON.stringify(file, null, 1))
    }
  })

  it.runIf(process.env.GEN_REPLAYS !== '1')('골든 리플레이가 5개 이상 존재한다', () => {
    expect(replayFiles.length).toBeGreaterThanOrEqual(5)
  })

  for (const fileName of replayFiles) {
    it(`${fileName}: 전 액션 합법 + 체크포인트·최종 해시 일치`, () => {
      const data = JSON.parse(readFileSync(join(DIR, fileName), 'utf8')) as ReplayFile
      const cps = new Map(data.checkpoints.map((c) => [c.index, c.hash]))
      let s = setupGame(data.config)

      data.actions.forEach((action, i) => {
        const v = validateAction(s, action)
        expect(v.ok, `액션 ${i} 불법: ${JSON.stringify(action)}`).toBe(true)
        s = applyAction(s, action).state
        const cp = cps.get(i + 1)
        if (cp) expect(hashState(s), `체크포인트 ${i + 1} 불일치`).toBe(cp)
      })

      expect(s.phase.kind).toBe('gameOver')
      expect(hashState(s), '최종 해시 불일치').toBe(data.finalHash)
    })
  }
})
