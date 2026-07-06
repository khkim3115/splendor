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
import { createHardAgent } from './mcts'
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

/**
 * 배포/스모크 검증용 경량 진단 (프로덕션 포함, docs/ROADMAP.md M8 DoD).
 * base '/splendor/' 경로에서 Worker가 실제로 로드됐는지를 런타임에서 관측한다.
 * `lastAlgo === 'fallback'` 또는 `fallbacks > 0`이면 Worker 로드 실패 → 그리디 폴백(§5.3).
 * 정상 로드 시 hard는 'mcts', 쉬움/보통은 'greedy1'/'greedy2'가 찍힌다.
 * gameplay·보안에 영향 없는 관측/검증 전용 표면이다.
 */
export interface AiDiagnostics {
  workerCreated: boolean
  lastAlgo: 'greedy1' | 'greedy2' | 'mcts' | 'fallback' | null
  responses: number // Worker에서 정상 수신한 응답 수
  fallbacks: number // 폴백 경로로 해소된 수
  setDelayScale: (scale: number) => void // 검증/스모크에서 체감 지연 제거
}

const diag: AiDiagnostics = {
  workerCreated: false,
  lastAlgo: null,
  responses: 0,
  fallbacks: 0,
  setDelayScale: setAiDelayScale,
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __splendorAi?: AiDiagnostics }).__splendorAi = diag
}

/** 검증에서 진단을 읽는다 (window가 없는 환경 대비) */
export function aiDiagnostics(): AiDiagnostics {
  return diag
}

/** 테스트 전용: 난이도별 예산 재정의 (Worker 미지원 환경의 hard 완주 테스트 등) */
let budgetOverride: Partial<Record<Difficulty, number>> = {}
export function setAiBudgetOverride(override: Partial<Record<Difficulty, number>>): void {
  budgetOverride = override
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
  /** Worker 미지원 환경의 메인스레드 hard 경로 전용 (Worker 경로에선 Worker 내부 인스턴스 사용) */
  private hardAgent = createHardAgent()

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
      diag.workerCreated = true
      this.worker.onmessage = (e: MessageEvent<AiResponse>) => {
        const p = this.pending.get(e.data.id)
        if (!p) return // 늦게 도착한 응답(undo 후 등)은 폐기
        this.pending.delete(e.data.id)
        clearTimeout(p.timer)
        diag.lastAlgo = e.data.stats.algo
        diag.responses++
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
    const budgetMs = budgetOverride[difficulty] ?? BUDGET_MS[difficulty]
    const fallback = (): Action => {
      // 메인스레드 그리디 1-ply — <5ms, 게임이 멈추지 않는다 (§5.3)
      diag.lastAlgo = 'fallback'
      diag.fallbacks++
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
        if (difficulty === 'hard') {
          if (this.workerBroken) {
            // Worker 크래시 후의 hard는 §5.3 그리디 폴백 — 메인스레드 1초 동기
            // MCTS는 착수마다 UI를 멈추므로 응답성을 우선한다
            console.warn('AI Worker 사용 불가(hard) — 그리디 폴백 (§5.3)')
            return fallback()
          }
          // Worker 자체가 없는 환경(jsdom 테스트 등)만 메인스레드 MCTS
          const [action] = this.hardAgent.chooseAction(view, me, budgetMs, createRng(aiSeed))
          return action
        }
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
