// 렌더러 소유 설정 영속 (스펙 §데이터 흐름: 글자코드 언어는 렌더러 localStorage)
// 테마·투명도는 Electron 메인 소유 — 여기서 다루지 않는다.

import { useCallback, useState } from 'react'
import type { GemLang } from './format'

export const TRAY_SETTINGS_KEY = 'splendor:tray'

export interface TrayExpand {
  board: boolean
  opponents: boolean
  nobles: boolean
}

interface Persisted {
  gemCodeLang: GemLang
  expand: TrayExpand
}

export interface TraySettings {
  gemCodeLang: GemLang
  setGemLang: (l: GemLang) => void
  expand: TrayExpand
  toggleExpand: (k: keyof TrayExpand) => void
}

const DEFAULTS: Persisted = {
  gemCodeLang: 'ko',
  expand: { board: false, opponents: false, nobles: false },
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(TRAY_SETTINGS_KEY)
    if (raw === null) return DEFAULTS
    const parsed = JSON.parse(raw) as { gemCodeLang?: GemLang; expand?: Partial<TrayExpand> }
    const lang: GemLang = parsed.gemCodeLang === 'en' ? 'en' : 'ko'
    const e = parsed.expand ?? {}
    return {
      gemCodeLang: lang,
      expand: {
        board: e.board === true,
        opponents: e.opponents === true,
        nobles: e.nobles === true,
      },
    }
  } catch {
    return DEFAULTS
  }
}

function write(next: Persisted): void {
  try {
    localStorage.setItem(TRAY_SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // 저장 실패는 무시 (게임 진행을 막지 않는다)
  }
}

export function useTraySettings(): TraySettings {
  const [state, setState] = useState<Persisted>(read)

  const setGemLang = useCallback((l: GemLang) => {
    setState((prev) => {
      const next = { ...prev, gemCodeLang: l }
      write(next)
      return next
    })
  }, [])

  const toggleExpand = useCallback((k: keyof TrayExpand) => {
    setState((prev) => {
      const next = { ...prev, expand: { ...prev.expand, [k]: !prev.expand[k] } }
      write(next)
      return next
    })
  }, [])

  return { gemCodeLang: state.gemCodeLang, setGemLang, expand: state.expand, toggleExpand }
}
