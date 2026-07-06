// @vitest-environment jsdom
// AI 클라이언트 견고성 (docs/AI_DESIGN.md §5.3):
// Worker 무응답/사망/미지원 어떤 상황에서도 합법 수가 나온다 — 게임이 멈추지 않는다

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiClient, setAiDelayScale } from '../../src/ai/client'
import { isLegal, legalActions } from '../../src/engine/legal'
import { setupGame } from '../../src/engine/setup'
import type { AiRequest, AiResponse } from '../../src/ai/protocol'
import { config } from '../helpers'

setAiDelayScale(0)

/** 영원히 응답하지 않는 Worker — 타임아웃 → 그리디 폴백 경로 검증 */
class SilentWorker {
  onmessage: unknown = null
  onerror: unknown = null
  postMessage(): void {}
  terminate(): void {}
}

/** 생성·종료·수신 메시지를 기록하는 Worker — cancelAll의 종료/프리워밍 검증용 */
class RecordingWorker {
  static instances: RecordingWorker[] = []
  onmessage: ((e: { data: AiResponse }) => void) | null = null
  onerror: unknown = null
  posted: AiRequest[] = []
  terminated = false
  constructor() {
    RecordingWorker.instances.push(this)
  }
  postMessage(msg: AiRequest): void {
    this.posted.push(msg)
  }
  terminate(): void {
    this.terminated = true
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AiClient 폴백', () => {
  it('Worker 미지원 환경에서는 메인스레드로 계산한다', async () => {
    const s = setupGame(config(2, 11))
    const client = new AiClient()
    const action = await client.requestMove(s, s.currentPlayer, 'easy', 1)
    expect(isLegal(s, action)).toBe(true)
  })

  it('Worker가 응답하지 않으면 타임아웃 후 그리디 폴백으로 수를 확정한다', async () => {
    vi.stubGlobal('Worker', SilentWorker)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setupGame(config(2, 12))
    const client = new AiClient()

    const started = performance.now()
    const action = await client.requestMove(s, s.currentPlayer, 'easy', 2)
    expect(isLegal(s, action)).toBe(true)
    expect(performance.now() - started).toBeGreaterThanOrEqual(400) // 예산+마진 대기
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('폴백'))
    warn.mockRestore()
  })

  it('Worker 미지원 환경에서 hard는 메인스레드 MCTS로 계산한다 (§5.1 코드 경로 통일)', { timeout: 15_000 }, async () => {
    const s = setupGame(config(2, 14))
    const client = new AiClient()
    const started = performance.now()
    const action = await client.requestMove(s, s.currentPlayer, 'hard', 4)
    const elapsed = performance.now() - started
    expect(isLegal(s, action)).toBe(true)
    // 그리디(<30ms)가 아니라 MCTS가 예산(1000ms)만큼 실제로 탐색했다는 행동 증거
    expect(elapsed).toBeGreaterThan(500)
  })

  it('killWorker(디버그 훅) 후에도 게임이 계속된다', async () => {
    vi.stubGlobal('Worker', SilentWorker)
    const s = setupGame(config(2, 13))
    const client = new AiClient()
    client.killWorker()
    const action = await client.requestMove(s, s.currentPlayer, 'normal', 3)
    expect(isLegal(s, action)).toBe(true)
  })
})

describe('AiClient cancelAll (undo·새 게임 경로 — src/store/gameStore.ts)', () => {
  it('진행 중 계산이 있으면 Worker를 종료하고 새 Worker를 프리워밍한다', async () => {
    // Worker는 단일 스레드 큐 — pending만 비우면 안에서 도는 MCTS(~1.3s)는 계속 돌아
    // 다음 hard 요청이 큐에 밀려 타임아웃(조용한 easy 강등)된다. terminate가 필수.
    vi.stubGlobal('Worker', RecordingWorker)
    RecordingWorker.instances = []
    const s = setupGame(config(2, 15))
    const client = new AiClient()

    void client.requestMove(s, s.currentPlayer, 'hard', 5) // 응답 없음 = 계산 중
    expect(RecordingWorker.instances).toHaveLength(1)
    const w0 = RecordingWorker.instances[0]!
    expect(w0.posted).toHaveLength(1)

    client.cancelAll()

    expect(w0.terminated).toBe(true) // 진행 중 계산 중단
    expect(RecordingWorker.instances).toHaveLength(2) // 즉시 프리워밍 (콜드 스타트 제거)

    // 다음 요청은 fresh Worker에서 타임아웃 없이 처리된다
    const w1 = RecordingWorker.instances[1]!
    expect(w1.terminated).toBe(false)
    const next = client.requestMove(s, s.currentPlayer, 'hard', 6)
    expect(w1.posted).toHaveLength(1)
    const req = w1.posted[0]!
    const reply = legalActions(s)[0]!
    w1.onmessage?.({
      data: {
        id: req.id,
        actionJson: JSON.stringify(reply),
        stats: { elapsedMs: 1, algo: 'mcts', iters: 1 },
      },
    })
    const action = await next
    expect(action).toEqual(reply)
    expect(isLegal(s, action)).toBe(true)
  })

  it('유휴 상태의 cancelAll은 종료 없이 프리워밍만 한다 (새 게임 시작 경로)', () => {
    vi.stubGlobal('Worker', RecordingWorker)
    RecordingWorker.instances = []
    const client = new AiClient()

    client.cancelAll() // newGame → cancelAll: 첫 hard 수의 Worker 콜드 스타트 제거
    expect(RecordingWorker.instances).toHaveLength(1)
    expect(RecordingWorker.instances[0]!.terminated).toBe(false)

    client.cancelAll() // 진행 중 계산 없음 — 기존 Worker 유지 (불필요한 재생성 없음)
    expect(RecordingWorker.instances).toHaveLength(1)
    expect(RecordingWorker.instances[0]!.terminated).toBe(false)
  })

  it('killWorker(영구 폴백 훅) 후 cancelAll은 Worker를 되살리지 않는다', () => {
    vi.stubGlobal('Worker', RecordingWorker)
    RecordingWorker.instances = []
    const client = new AiClient()

    client.killWorker() // workerBroken — 그리디 폴백 경로 고정용 디버그 훅
    client.cancelAll()
    expect(RecordingWorker.instances).toHaveLength(0)
  })
})
