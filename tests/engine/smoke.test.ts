import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, ping } from '../../src/engine'

describe('M0 파이프라인 스모크', () => {
  it('엔진 모듈이 로드되고 더미 함수가 동작한다', () => {
    expect(ping()).toBe('pong')
    expect(ENGINE_VERSION).toBe('0.0.0-m0')
  })
})
