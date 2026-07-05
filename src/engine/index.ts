// 순수 룰 엔진 공개 API (docs/ARCHITECTURE.md §3)
// M0: 파이프라인 관통 확인용 더미. M1부터 실제 API로 대체된다.

export const ENGINE_VERSION = '0.0.0-m0'

/** 파이프라인 관통 확인용 더미 함수 — M1에서 제거 */
export function ping(): 'pong' {
  return 'pong'
}
