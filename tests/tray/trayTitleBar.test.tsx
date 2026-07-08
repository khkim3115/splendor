// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrayTitleBar } from '../../src/tray/TrayTitleBar'

function installTray(over: Record<string, unknown> = {}) {
  const tray = {
    hide: vi.fn(),
    setOpacity: vi.fn(),
    setTheme: vi.fn(),
    onOpacity: (cb: (v: number) => void) => { cb(70); return () => {} },
    ...over,
  }
  ;(window as unknown as { tray: unknown }).tray = tray
  return tray
}

describe('TrayTitleBar', () => {
  afterEach(() => { cleanup(); delete (window as { tray?: unknown }).tray })

  it('드래그 영역 루트가 존재한다', () => {
    installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    expect(document.querySelector('[data-tray-titlebar]')).toBeTruthy()
  })

  it('닫기(✕) → window.tray.hide()', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    fireEvent.click(screen.getByLabelText('닫기'))
    expect(tray.hide).toHaveBeenCalledTimes(1)
  })

  it('테마 토글 → 현재의 반대 테마로 setTheme', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    fireEvent.click(screen.getByLabelText('테마 전환'))
    expect(tray.setTheme).toHaveBeenCalledWith('light')
  })

  it('🔅 클릭 → setPopoverOpen(true)', () => {
    installTray()
    const setOpen = vi.fn()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={setOpen} />)
    fireEvent.click(screen.getByLabelText('투명도'))
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('팝오버 열림 시 저장된 투명도(onOpacity)로 슬라이더 복원', () => {
    installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    const range = screen.getByLabelText('투명도 조절') as HTMLInputElement
    expect(range.value).toBe('70')
  })

  it('슬라이더 조작 → 실시간 적용(persist=false)', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    fireEvent.change(screen.getByLabelText('투명도 조절'), { target: { value: '55' } })
    expect(tray.setOpacity).toHaveBeenCalledWith(55, false)
  })

  it('슬라이더 놓을 때 → 저장(persist=true)', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    const range = screen.getByLabelText('투명도 조절')
    fireEvent.change(range, { target: { value: '40' } })
    fireEvent.mouseUp(range, { target: { value: '40' } })
    expect(tray.setOpacity).toHaveBeenCalledWith(40, true)
  })
})
