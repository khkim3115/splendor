// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRAY_SETTINGS_KEY, useTraySettings } from '../../src/tray/useTraySettings'

describe('useTraySettings', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('기본값: 한글 코드, 전부 접힘', () => {
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('ko')
    expect(result.current.expand).toEqual({ board: false, opponents: false, nobles: false })
  })

  it('setGemLang이 상태와 localStorage를 갱신한다', () => {
    const { result } = renderHook(() => useTraySettings())
    act(() => result.current.setGemLang('en'))
    expect(result.current.gemCodeLang).toBe('en')
    expect(JSON.parse(localStorage.getItem(TRAY_SETTINGS_KEY)!).gemCodeLang).toBe('en')
  })

  it('toggleExpand이 해당 키만 뒤집는다', () => {
    const { result } = renderHook(() => useTraySettings())
    act(() => result.current.toggleExpand('board'))
    expect(result.current.expand.board).toBe(true)
    expect(result.current.expand.opponents).toBe(false)
    act(() => result.current.toggleExpand('board'))
    expect(result.current.expand.board).toBe(false)
  })

  it('초기 마운트가 저장된 값을 읽어온다', () => {
    localStorage.setItem(
      TRAY_SETTINGS_KEY,
      JSON.stringify({ gemCodeLang: 'en', expand: { board: true, opponents: false, nobles: true } }),
    )
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('en')
    expect(result.current.expand).toEqual({ board: true, opponents: false, nobles: true })
  })

  it('손상된 저장값은 기본값으로 폴백한다', () => {
    localStorage.setItem(TRAY_SETTINGS_KEY, '{not json')
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('ko')
  })
})
