import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildTrayTemplate } = require('../../desktop/lib/trayMenu.cjs') as {
  buildTrayTemplate: (
    state: {
      isLight: boolean
      bossKey: string
      pinned: boolean
      hasCustomPos: boolean
      autoOn: boolean
      platform?: string
    },
    handlers: {
      onOpen: () => void
      onToggleTheme: () => void
      onChangeBossKey: () => void
      onTogglePin: (checked: boolean) => void
      onResetPosition: () => void
      onToggleAutostart: (checked: boolean) => void
      onQuit: () => void
    },
  ) => Array<Record<string, unknown>>
}

function noopHandlers() {
  return {
    onOpen: vi.fn(),
    onToggleTheme: vi.fn(),
    onChangeBossKey: vi.fn(),
    onTogglePin: vi.fn(),
    onResetPosition: vi.fn(),
    onToggleAutostart: vi.fn(),
    onQuit: vi.fn(),
  }
}

const baseState = {
  isLight: false,
  bossKey: 'CommandOrControl+Alt+Space',
  pinned: false,
  hasCustomPos: false,
  autoOn: true,
  platform: 'win32',
}

describe('buildTrayTemplate', () => {
  it('electron 을 import 하지 않고도(순수 함수) 항목 배열을 만든다', () => {
    const template = buildTrayTemplate(baseState, noopHandlers())
    expect(Array.isArray(template)).toBe(true)
  })

  it('항목 구성 — 열기/라이트모드/보스키변경/구분선/위치고정/위치초기화/자동실행/구분선/종료', () => {
    const template = buildTrayTemplate(baseState, noopHandlers())
    const labels = template.map((i) => i.label ?? `(${i.type})`)
    expect(labels).toEqual([
      '열기',
      '라이트 모드',
      '보스키 변경 (CommandOrControl+Alt+Space)',
      '(separator)',
      '위치 고정',
      '위치 초기화',
      'Windows 시작 시 자동 실행',
      '(separator)',
      '종료',
    ])
  })

  it('라이트 모드 checkbox 는 isLight 를 반영한다', () => {
    const dark = buildTrayTemplate({ ...baseState, isLight: false }, noopHandlers())
    const light = buildTrayTemplate({ ...baseState, isLight: true }, noopHandlers())
    expect(dark.find((i) => i.label === '라이트 모드')).toMatchObject({ type: 'checkbox', checked: false })
    expect(light.find((i) => i.label === '라이트 모드')).toMatchObject({ type: 'checkbox', checked: true })
  })

  it('위치 고정 checkbox 는 pinned 를 반영한다', () => {
    const off = buildTrayTemplate({ ...baseState, pinned: false }, noopHandlers())
    const on = buildTrayTemplate({ ...baseState, pinned: true }, noopHandlers())
    expect(off.find((i) => i.label === '위치 고정')).toMatchObject({ type: 'checkbox', checked: false })
    expect(on.find((i) => i.label === '위치 고정')).toMatchObject({ type: 'checkbox', checked: true })
  })

  it('위치 초기화는 hasCustomPos 가 true 일 때만 enabled', () => {
    const noCustom = buildTrayTemplate({ ...baseState, hasCustomPos: false }, noopHandlers())
    const withCustom = buildTrayTemplate({ ...baseState, hasCustomPos: true }, noopHandlers())
    expect(noCustom.find((i) => i.label === '위치 초기화')).toMatchObject({ enabled: false })
    expect(withCustom.find((i) => i.label === '위치 초기화')).toMatchObject({ enabled: true })
  })

  it('자동 실행 checkbox 는 autoOn 을 반영한다', () => {
    const off = buildTrayTemplate({ ...baseState, autoOn: false }, noopHandlers())
    const on = buildTrayTemplate({ ...baseState, autoOn: true }, noopHandlers())
    expect(off.find((i) => i.label === 'Windows 시작 시 자동 실행')).toMatchObject({
      type: 'checkbox',
      checked: false,
    })
    expect(on.find((i) => i.label === 'Windows 시작 시 자동 실행')).toMatchObject({
      type: 'checkbox',
      checked: true,
    })
  })

  it('보스키 라벨은 현재 bossKey 를 반영한다', () => {
    const template = buildTrayTemplate({ ...baseState, bossKey: 'Ctrl+Shift+Y' }, noopHandlers())
    expect(template.find((i) => String(i.label).startsWith('보스키 변경'))).toMatchObject({
      label: '보스키 변경 (Ctrl+Shift+Y)',
    })
  })

  it('각 항목의 click 핸들러는 대응하는 콜백을 호출한다(체크박스 항목은 item.checked 를 전달)', () => {
    const handlers = noopHandlers()
    const template = buildTrayTemplate(baseState, handlers)

    const open = template.find((i) => i.label === '열기') as { click: () => void }
    open.click()
    expect(handlers.onOpen).toHaveBeenCalledTimes(1)

    const theme = template.find((i) => i.label === '라이트 모드') as { click: () => void }
    theme.click()
    expect(handlers.onToggleTheme).toHaveBeenCalledTimes(1)

    const bossKey = template.find((i) => String(i.label).startsWith('보스키 변경')) as { click: () => void }
    bossKey.click()
    expect(handlers.onChangeBossKey).toHaveBeenCalledTimes(1)

    const pin = template.find((i) => i.label === '위치 고정') as { click: (item: { checked: boolean }) => void }
    pin.click({ checked: true })
    expect(handlers.onTogglePin).toHaveBeenCalledWith(true)

    const reset = template.find((i) => i.label === '위치 초기화') as { click: () => void }
    reset.click()
    expect(handlers.onResetPosition).toHaveBeenCalledTimes(1)

    const auto = template.find((i) => i.label === 'Windows 시작 시 자동 실행') as {
      click: (item: { checked: boolean }) => void
    }
    auto.click({ checked: false })
    expect(handlers.onToggleAutostart).toHaveBeenCalledWith(false)

    const quit = template.find((i) => i.label === '종료') as { click: () => void }
    quit.click()
    expect(handlers.onQuit).toHaveBeenCalledTimes(1)
  })

  it('mac 에서는 자동 실행 라벨이 "로그인 시 자동 실행" 이다', () => {
    const mac = buildTrayTemplate({ ...baseState, platform: 'darwin' }, noopHandlers())
    const win = buildTrayTemplate({ ...baseState, platform: 'win32' }, noopHandlers())
    expect(mac.find((i) => i.type === 'checkbox' && String(i.label).includes('자동 실행'))).toMatchObject({
      label: '로그인 시 자동 실행',
    })
    expect(win.find((i) => i.type === 'checkbox' && String(i.label).includes('자동 실행'))).toMatchObject({
      label: 'Windows 시작 시 자동 실행',
    })
  })

  it('updateReady 가 없으면(undefined) 업데이트 설치 항목이 없다(기존 9항목 그대로)', () => {
    const template = buildTrayTemplate(baseState, noopHandlers())
    const labels = template.map((i) => i.label ?? `(${i.type})`)
    expect(labels).toEqual([
      '열기',
      '라이트 모드',
      '보스키 변경 (CommandOrControl+Alt+Space)',
      '(separator)',
      '위치 고정',
      '위치 초기화',
      'Windows 시작 시 자동 실행',
      '(separator)',
      '종료',
    ])
  })

  it('updateReady:false 면 업데이트 설치 항목이 없다', () => {
    const template = buildTrayTemplate({ ...baseState, updateReady: false }, noopHandlers())
    expect(template.find((i) => i.label === '업데이트 설치 후 재시작')).toBeUndefined()
  })

  it('updateReady:true 면 "종료" 직전에 separator + "업데이트 설치 후 재시작" 항목이 추가된다', () => {
    const template = buildTrayTemplate({ ...baseState, updateReady: true }, noopHandlers())
    const labels = template.map((i) => i.label ?? `(${i.type})`)
    expect(labels).toEqual([
      '열기',
      '라이트 모드',
      '보스키 변경 (CommandOrControl+Alt+Space)',
      '(separator)',
      '위치 고정',
      '위치 초기화',
      'Windows 시작 시 자동 실행',
      '(separator)',
      '(separator)',
      '업데이트 설치 후 재시작',
      '종료',
    ])
  })

  it('updateReady:true 항목의 click 은 onInstallUpdate 핸들러를 호출한다', () => {
    const handlers = { ...noopHandlers(), onInstallUpdate: vi.fn() }
    const template = buildTrayTemplate({ ...baseState, updateReady: true }, handlers)
    const install = template.find((i) => i.label === '업데이트 설치 후 재시작') as { click: () => void }
    install.click()
    expect(handlers.onInstallUpdate).toHaveBeenCalledTimes(1)
  })
})
