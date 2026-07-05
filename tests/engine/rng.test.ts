import { describe, expect, it } from 'vitest'
import { createRng, nextInt, shuffle } from '../../src/engine/rng'

describe('시드 RNG (splitmix32)', () => {
  it('알려진 시드에 대해 고정 수열을 낸다 (리그레션 고정)', () => {
    let rng = createRng(42)
    const seq: number[] = []
    for (let i = 0; i < 8; i++) {
      const [v, next] = nextInt(rng, 1000)
      seq.push(v)
      rng = next
    }
    expect(seq).toEqual([128, 33, 75, 706, 211, 616, 14, 434])
  })

  it('같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
    const run = (seed: number) => {
      let rng = createRng(seed)
      const seq: number[] = []
      for (let i = 0; i < 20; i++) {
        const [v, next] = nextInt(rng, 1_000_000)
        seq.push(v)
        rng = next
      }
      return seq
    }
    expect(run(7)).toEqual(run(7))
    expect(run(7)).not.toEqual(run(8))
  })

  it('nextInt는 [0, bound) 범위를 지킨다', () => {
    let rng = createRng(123)
    for (let i = 0; i < 500; i++) {
      const [v, next] = nextInt(rng, 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
      rng = next
    }
  })

  it('nextInt는 잘못된 bound를 거부한다', () => {
    expect(() => nextInt(createRng(1), 0)).toThrow()
    expect(() => nextInt(createRng(1), -3)).toThrow()
    expect(() => nextInt(createRng(1), 2.5)).toThrow()
  })

  it('shuffle은 순열을 반환하고 입력을 변형하지 않는다', () => {
    const input = Object.freeze([...Array(90).keys()])
    const [out] = shuffle(createRng(99), input)
    expect([...out].sort((a, b) => a - b)).toEqual([...input])
    expect(input).toEqual([...Array(90).keys()])
    expect(out).not.toEqual(input) // 90장이 항등 순열로 섞일 확률은 사실상 0
  })

  it('shuffle도 시드에 결정론적이다', () => {
    const xs = [...Array(40).keys()]
    const [a] = shuffle(createRng(5), xs)
    const [b] = shuffle(createRng(5), xs)
    expect(a).toEqual(b)
  })
})
