// 개발용 deep-freeze 가드 — applyAction의 입출력 상태를 동결해 변이를 즉시 드러낸다.
// 상태 객체가 작아 비용은 무시 가능. AI 탐색 핫패스만 setStateFreezing(false)로 끈다
// (docs/AI_DESIGN.md §4.4 L0).

let freezing = true

export function setStateFreezing(enabled: boolean): void {
  freezing = enabled
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
}

export function maybeFreeze<T>(value: T): T {
  if (freezing) deepFreeze(value)
  return value
}
