// @vitest-environment jsdom
// AI 클라이언트 견고성 (docs/AI_DESIGN.md §5.3):
// Worker 무응답/사망/미지원 어떤 상황에서도 합법 수가 나온다 — 게임이 멈추지 않는다

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiClient, setAiDelayScale } from '../../src/ai/client'
import { isLegal } from '../../src/engine/legal'
import { setupGame } from '../../src/engine/setup'
import { config } from '../helpers'

setAiDelayScale(0)

/** 영원히 응답하지 않는 Worker — 타임아웃 → 그리디 폴백 경로 검증 */
class SilentWorker {
  onmessage: unknown = null
  onerror: unknown = null
  postMessage(): void {}
  terminate(): void {}
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
