// 메인스레드 프록시 (docs/AI_DESIGN.md §5) — 요청 id 매칭, 하드 타임아웃,
// Worker 크래시/미지원 시 동일 코드의 그리디 폴백. 게임이 어떤 상황에서도 멈추지 않는다.

import {
  createRng,
  playerView,
  type Action,
  type Difficulty,
  type GameState,
} from '../engine'
import { chooseActionSync } from './greedy'
import type { AiRequest, AiResponse } from './protocol'

/** 난이도별 계산 예산 (docs/AI_DESIGN.md §5.4) */
const BUDGET_MS: Record<Difficulty, number> = { easy: 5, normal: 30, hard: 1000 }
/** 체감 최소 지연 — 실제 계산이 몇 ms여도 "고민" 연출 */
const MIN_DELAY_MS: Record<Difficulty, number> = { easy: 500, normal: 600, hard: 0 }
const TIMEOUT_MARGIN_MS = 500

/** 테스트/자동 완주에서 체감 지연을 끈다 */
let delayScale = 1
export function setAiDelayScale(scale: number): void {
  delayScale = scale
}

interface Pending {
  resolve: (action: Action) => void
  timer: ReturnType<typeof setTimeout>
  fallback: () => Action
}

export class AiClient {
  private worker: Worker | null = null
  private workerBroken = false
  private nextId = 1
  private pending = new Map<number, Pending>()

  /** 디버그 훅: Worker 강제 종료 → 그리디 폴백 경로 검증용 */
  killWorker(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerBroken = true
  }

  cancelAll(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
  }

  private ensureWorker(): Worker | null {
    if (this.workerBroken || typeof Worker === 'undefined') return null
    if (this.worker) return this.worker
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<AiResponse>) => {
        const p = this.pending.get(e.data.id)
        if (!p) return // 늦게 도착한 응답(undo 후 등)은 폐기
        this.pending.delete(e.data.id)
        clearTimeout(p.timer)
        p.resolve(JSON.parse(e.data.actionJson) as Action)
      }
      this.worker.onerror = () => {
        // Worker 사망 — 진행 중 요청 전부 폴백으로 즉시 해소
        this.workerBroken = true
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer)
          this.pending.delete(id)
          p.resolve(p.fallback())
        }
      }
      return this.worker
    } catch {
      this.workerBroken = true
      return null
    }
  }

  /**
   * committed(진짜 상태)를 받아 마스킹은 여기서 수행 —
   * Worker 밖으로 마스킹 안 된 상태가 나가지 않는다.
   */
  async requestMove(
    committed: GameState,
    me: number,
    difficulty: Difficulty,
    aiSeed: number,
  ): Promise<Action> {
    const view = playerView(committed, me)
    const budgetMs = BUDGET_MS[difficulty]
    const fallback = (): Action => {
      // 메인스레드 그리디 1-ply — <5ms, 게임이 멈추지 않는다 (§5.3)
      const [action] = chooseActionSync(view, me, 'easy', createRng(aiSeed))
      return action
    }

    const minDelay = new Promise<void>((r) =>
      setTimeout(r, MIN_DELAY_MS[difficulty] * delayScale),
    )

    const worker = this.ensureWorker()
    let move: Promise<Action>
    if (!worker) {
      // Worker 미지원 환경(테스트 등): 메인스레드에서 동일 코드 실행
      move = Promise.resolve().then(() => {
        const [action] = chooseActionSync(view, me, difficulty, createRng(aiSeed))
        return action
      })
    } else {
      const id = this.nextId++
      move = new Promise<Action>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.pending.delete(id)) return
          console.warn(`AI 응답 타임아웃(${difficulty}) — 그리디 폴백 (§5.3)`)
          resolve(fallback())
        }, budgetMs + TIMEOUT_MARGIN_MS)
        this.pending.set(id, { resolve, timer, fallback })
        const request: AiRequest = {
          id,
          stateJson: JSON.stringify(view),
          me,
          difficulty,
          budgetMs,
          aiSeed,
        }
        worker.postMessage(request)
      })
    }

    const [action] = await Promise.all([move, minDelay])
    return action
  }
}

export const aiClient = new AiClient()
