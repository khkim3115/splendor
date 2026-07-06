// 메인스레드 프록시 (docs/AI_DESIGN.md §5) — 요청 id 매칭, 하드 타임아웃.
// 정상 경로는 Worker의 chooseAction 라우팅(easy/normal 그리디, hard MCTS — §5.1).
// Worker 크래시/타임아웃 시 그리디 1-ply 폴백, 미지원 환경(테스트 등)은 메인스레드에서
// 같은 chooseAction을 실행. 게임이 어떤 상황에서도 멈추지 않는다.

import {
  createRng,
  playerView,
  type Action,
  type Difficulty,
  type GameState,
} from '../engine'
import { chooseAction } from './chooseAction'
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

  /**
   * undo·새 게임 경로(src/store/gameStore.ts) — pending을 비우는 것만으로는 부족하다:
   * Worker는 단일 스레드 큐라 안에서 도는 MCTS(~1.3s)는 계속 돌고, 다음 hard 요청이
   * 큐에 밀려 하드 타임아웃(조용한 easy 강등)이 난다. 진행 중 계산이 있으면 Worker를
   * 종료하고, 즉시 프리워밍해 다음 요청의 콜드 스타트(모듈 로드)도 제거한다.
   * workerBroken은 건드리지 않는다 — 그건 killWorker(영구 폴백 디버그 훅) 전용.
   */
  cancelAll(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer)
    const hadInFlight = this.pending.size > 0
    this.pending.clear()
    if (hadInFlight && this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.ensureWorker() // 프리워밍 — workerBroken/Worker 미지원이면 no-op
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
      // Worker 미지원 환경(테스트 등): 메인스레드에서 동일 라우팅 실행 (§5.1)
      // — hard도 Worker 경로와 같은 chooseAction을 타서 MCTS로 계산된다
      move = Promise.resolve().then(
        () => chooseAction(view, me, difficulty, budgetMs, createRng(aiSeed)).action,
      )
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
