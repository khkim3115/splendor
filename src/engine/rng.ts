// 시드 기반 결정론 PRNG — splitmix32 (docs/ARCHITECTURE.md §3.1)
// 저장소 전체에서 무작위성의 유일한 원천. RNG 상태는 값으로 전달된다(순수성).

export type RngState = number

export function createRng(seed: number): RngState {
  return seed >>> 0
}

/** splitmix32 한 스텝: 32비트 무부호 정수와 다음 상태를 반환 */
function next(state: RngState): readonly [number, RngState] {
  const s = (state + 0x9e3779b9) >>> 0
  let z = s
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  z = (z ^ (z >>> 15)) >>> 0
  return [z, s]
}

/** [0, bound) 정수. bound ≤ 2^16 수준에서 편향은 무시 가능 */
export function nextInt(rng: RngState, bound: number): readonly [number, RngState] {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new Error(`nextInt: bound must be a positive integer, got ${bound}`)
  }
  const [z, s] = next(rng)
  return [Math.floor((z / 4294967296) * bound), s]
}

/** Fisher-Yates 셔플 — 입력을 변형하지 않고 새 배열을 반환 */
export function shuffle<T>(rng: RngState, xs: readonly T[]): readonly [readonly T[], RngState] {
  const out = [...xs]
  let state = rng
  for (let i = out.length - 1; i > 0; i--) {
    const [j, nextState] = nextInt(state, i + 1)
    state = nextState
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return [out, state]
}
