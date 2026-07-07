import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createUpdateState, updateMenuItems } = require('../../desktop/lib/updateState.cjs') as {
  createUpdateState: () => {
    phase: string
    ready: boolean
    setChecking: () => void
    setDownloading: () => void
    setDownloaded: () => void
    setError: (message?: string) => void
  }
  updateMenuItems: (
    state: { phase: string; ready: boolean },
    handlers: { onInstall: () => void },
  ) => Array<Record<string, unknown>>
}

describe('createUpdateState', () => {
  it('초기 상태는 idle·ready=false', () => {
    const s = createUpdateState()
    expect(s.phase).toBe('idle')
    expect(s.ready).toBe(false)
  })

  it('setChecking/ setDownloading 은 phase 만 바꾸고 ready 는 false 유지', () => {
    const s = createUpdateState()
    s.setChecking()
    expect(s.phase).toBe('checking')
    expect(s.ready).toBe(false)
    s.setDownloading()
    expect(s.phase).toBe('downloading')
    expect(s.ready).toBe(false)
  })

  it('setDownloaded 는 phase=downloaded·ready=true 로 만든다', () => {
    const s = createUpdateState()
    s.setDownloaded()
    expect(s.phase).toBe('downloaded')
    expect(s.ready).toBe(true)
  })

  it('ready=true(설치 준비완료) 이후 setChecking/setDownloading/setError 가 호출돼도 ready 사실은 덮어써지지 않는다', () => {
    const s = createUpdateState()
    s.setDownloaded()
    expect(s.ready).toBe(true)

    s.setChecking()
    expect(s.ready).toBe(true) // ready 사실 보존
    expect(s.phase).toBe('downloaded') // phase 표시도 downloaded 유지(진행상태로 덮어쓰지 않음)

    s.setDownloading()
    expect(s.ready).toBe(true)
    expect(s.phase).toBe('downloaded')

    s.setError('network fail')
    expect(s.ready).toBe(true)
    expect(s.phase).toBe('downloaded')
  })

  it('setError 는 ready 이전이면 phase=error 로 전이한다', () => {
    const s = createUpdateState()
    s.setChecking()
    s.setError('boom')
    expect(s.phase).toBe('error')
    expect(s.ready).toBe(false)
  })

  it('idle → checking → downloading → downloaded 순서 전이 후에도 ready 는 최종 true', () => {
    const s = createUpdateState()
    s.setChecking()
    s.setDownloading()
    s.setDownloaded()
    expect(s.phase).toBe('downloaded')
    expect(s.ready).toBe(true)
  })
})

describe('updateMenuItems', () => {
  function noopHandlers() {
    return { onInstall: vi.fn() }
  }

  it('idle 상태에서는 메뉴 항목을 추가하지 않는다(빈 배열)', () => {
    const items = updateMenuItems({ phase: 'idle', ready: false }, noopHandlers())
    expect(items).toEqual([])
  })

  it('checking 상태에서는 항목을 추가하지 않는다(조용히 확인 중 — 메뉴에 노출 안 함)', () => {
    const items = updateMenuItems({ phase: 'checking', ready: false }, noopHandlers())
    expect(items).toEqual([])
  })

  it('downloading 상태에서는 항목을 추가하지 않는다', () => {
    const items = updateMenuItems({ phase: 'downloading', ready: false }, noopHandlers())
    expect(items).toEqual([])
  })

  it('error 상태에서는 항목을 추가하지 않는다', () => {
    const items = updateMenuItems({ phase: 'error', ready: false }, noopHandlers())
    expect(items).toEqual([])
  })

  it('ready=true 면 separator + "업데이트 설치 후 재시작" 항목을 반환한다', () => {
    const items = updateMenuItems({ phase: 'downloaded', ready: true }, noopHandlers())
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ type: 'separator' })
    expect(items[1]).toMatchObject({ label: '업데이트 설치 후 재시작' })
  })

  it('ready=true 항목의 click 은 onInstall 핸들러를 호출한다', () => {
    const handlers = noopHandlers()
    const items = updateMenuItems({ phase: 'downloaded', ready: true }, handlers)
    const install = items[1] as { click: () => void }
    install.click()
    expect(handlers.onInstall).toHaveBeenCalledTimes(1)
  })
})
