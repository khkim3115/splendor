// 버전 태그 세이브/로드 (docs/ARCHITECTURE.md §4.1)
// (config, actions[])가 진실원이고, 로드는 검증 리플레이로 재구성한다.
/* eslint-disable no-restricted-properties -- 저장 타임스탬프(Date.now)는 게임 결정론과 무관한 메타데이터다 (docs/ARCHITECTURE.md §1 예외) */

import {
  CARDS,
  NOBLES,
  RULES_VERSION,
  applyAction,
  fnv1a,
  hashState,
  replay,
  validateAction,
  type Action,
  type GameConfig,
  type GameState,
} from '../engine'

export interface SaveFileV1 {
  schemaVersion: 1
  rulesVersion: string
  dataChecksum: string
  config: GameConfig
  actions: Action[]
  finalHash: string
  savedAt: number
}

const STORAGE_KEY = 'splendor:save'

/** 카드 데이터 지문 — 데이터가 바뀐 빌드의 세이브를 검증 리플레이로 거른다 */
export function dataChecksum(): string {
  return fnv1a(JSON.stringify({ cards: CARDS, nobles: NOBLES }))
}

export type LoadResult =
  | { ok: true; state: GameState; actions: Action[] }
  | { ok: false; reason: string }

export function saveGame(config: GameConfig, actions: readonly Action[], state: GameState): void {
  const file: SaveFileV1 = {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    dataChecksum: dataChecksum(),
    config,
    actions: [...actions],
    finalHash: hashState(state),
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch {
    // 저장 실패(용량 등)는 게임 진행을 막지 않는다
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * 로드 절차 (§4.1): schemaVersion 확인 → 검증 리플레이(매 액션 validateAction +
 * 최종 hashState 대조) → 통과 시 복원. rulesVersion/dataChecksum이 달라도
 * 검증 리플레이가 통과하면 이어할 수 있다.
 */
export function loadGame(): LoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { ok: false, reason: '저장소에 접근할 수 없습니다' }
  }
  if (raw === null) return { ok: false, reason: '저장된 게임이 없습니다' }

  let file: SaveFileV1
  try {
    file = JSON.parse(raw) as SaveFileV1
  } catch {
    return { ok: false, reason: '저장된 게임 데이터가 손상되었습니다' }
  }
  if (file?.schemaVersion !== 1) {
    return { ok: false, reason: '알 수 없는 세이브 형식입니다 (이전/이후 버전에서 저장됨)' }
  }
  if (!Array.isArray(file.actions) || typeof file.finalHash !== 'string') {
    return { ok: false, reason: '저장된 게임 데이터가 손상되었습니다' }
  }

  try {
    // 검증 리플레이 — 룰/데이터가 바뀌었으면 여기서 걸린다
    let final = replay(file.config, [])
    for (const [i, action] of file.actions.entries()) {
      const v = validateAction(final, action)
      if (!v.ok) {
        return {
          ok: false,
          reason: `이전 버전에서 저장된 게임이라 이어할 수 없습니다 (${i + 1}번째 수가 현재 룰과 불일치: ${v.rule})`,
        }
      }
      final = applyAction(final, action).state
    }
    if (hashState(final) !== file.finalHash) {
      return {
        ok: false,
        reason: '이전 버전에서 저장된 게임이라 이어할 수 없습니다 (상태 재구성 결과가 저장 시점과 다름)',
      }
    }
    return { ok: true, state: final, actions: file.actions }
  } catch (e) {
    return {
      ok: false,
      reason: `저장된 게임을 복원할 수 없습니다: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
