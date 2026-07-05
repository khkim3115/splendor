import type { Action } from './types'

export interface ValidationFailure {
  readonly ok: false
  readonly rule: string // 근거 조항, 예: '§4.2'
  readonly messageKo: string
}

export type ValidationResult = { readonly ok: true } | ValidationFailure

/** 불법 액션 적용 시 throw — 근거 §번호가 담긴다 (docs/ARCHITECTURE.md §3) */
export class IllegalActionError extends Error {
  readonly rule: string
  readonly messageKo: string
  readonly action: Action

  constructor(failure: ValidationFailure, action: Action) {
    super(`[${failure.rule}] ${failure.messageKo}`)
    this.name = 'IllegalActionError'
    this.rule = failure.rule
    this.messageKo = failure.messageKo
    this.action = action
  }
}
