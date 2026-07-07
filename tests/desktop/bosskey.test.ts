import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DEFAULT_BOSS_KEY, nextVisibility, registerBossKey, setBossKey } = require(
  '../../desktop/lib/bosskey.cjs',
) as {
  DEFAULT_BOSS_KEY: string
  nextVisibility: (isVisible: boolean) => 'hide' | 'show'
  registerBossKey: (globalShortcut: FakeGlobalShortcut, accel: string, cb: () => void) => boolean
  setBossKey: (
    globalShortcut: FakeGlobalShortcut,
    currentAccel: string,
    nextAccel: string,
    cb: () => void,
  ) => { ok: boolean; accel: string }
}
const { DEFAULTS } = require('../../desktop/lib/settings.cjs') as {
  DEFAULTS: Record<string, unknown>
}

type FakeGlobalShortcut = {
  register: (accel: string, cb: () => void) => boolean
  unregister: (accel: string) => void
  unregisterAll: () => void
}

function fakeGlobalShortcut(overrides: Partial<FakeGlobalShortcut> = {}): FakeGlobalShortcut {
  return {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    ...overrides,
  }
}

describe('DEFAULT_BOSS_KEY', () => {
  it('기본 보스키는 CommandOrControl+Alt+Space', () => {
    expect(DEFAULT_BOSS_KEY).toBe('CommandOrControl+Alt+Space')
  })

  it('bosskey.cjs 의 DEFAULT_BOSS_KEY 는 settings.cjs 의 DEFAULTS.bossKey 와 항상 동일해야 한다 (디싱크 방지)', () => {
    expect(DEFAULT_BOSS_KEY).toBe(DEFAULTS.bossKey)
  })
})

describe('nextVisibility', () => {
  it('보이는 상태면 hide 를 반환', () => {
    expect(nextVisibility(true)).toBe('hide')
  })
  it('숨겨진 상태면 show 를 반환', () => {
    expect(nextVisibility(false)).toBe('show')
  })
})

describe('registerBossKey', () => {
  it('등록 성공이면 true 를 반환하고 콜백을 등록에 넘긴다', () => {
    const gs = fakeGlobalShortcut()
    const cb = () => {}
    expect(registerBossKey(gs, 'CommandOrControl+Alt+Space', cb)).toBe(true)
    expect(gs.register).toHaveBeenCalledWith('CommandOrControl+Alt+Space', cb)
  })

  it('충돌(register가 false 반환)이면 false 를 반환', () => {
    const gs = fakeGlobalShortcut({ register: vi.fn(() => false) })
    expect(registerBossKey(gs, 'CommandOrControl+Alt+Space', () => {})).toBe(false)
  })

  it('register 가 예외를 던져도 false 를 반환(크래시하지 않음)', () => {
    const gs = fakeGlobalShortcut({
      register: vi.fn(() => {
        throw new Error('invalid accelerator')
      }),
    })
    expect(registerBossKey(gs, 'not-a-valid-accel', () => {})).toBe(false)
  })
})

describe('setBossKey', () => {
  it('새 조합 등록 성공 시 성공을 보고하고 새 조합을 반환', () => {
    const gs = fakeGlobalShortcut()
    const result = setBossKey(gs, 'CommandOrControl+Alt+Space', 'Ctrl+Shift+Y', () => {})
    expect(result).toEqual({ ok: true, accel: 'Ctrl+Shift+Y' })
  })

  it('새 조합 등록 실패 시 기존 조합으로 복구하고 실패를 보고', () => {
    const registerCalls: string[] = []
    const gs = fakeGlobalShortcut({
      register: vi.fn((accel: string) => {
        registerCalls.push(accel)
        // 새 조합만 실패시킨다(충돌 시뮬레이션).
        return accel !== 'Ctrl+Shift+Y'
      }),
    })
    const result = setBossKey(gs, 'CommandOrControl+Alt+Space', 'Ctrl+Shift+Y', () => {})
    expect(result).toEqual({ ok: false, accel: 'CommandOrControl+Alt+Space' })
    // 실패 후 기존 조합으로 재등록을 시도했어야 한다(바인딩 손실 방지).
    expect(registerCalls).toEqual(['Ctrl+Shift+Y', 'CommandOrControl+Alt+Space'])
  })

  it('등록 전 기존 바인딩을 해제한다(unregisterAll 호출)', () => {
    const gs = fakeGlobalShortcut()
    setBossKey(gs, 'CommandOrControl+Alt+Space', 'Ctrl+Shift+Y', () => {})
    expect(gs.unregisterAll).toHaveBeenCalled()
  })
})
