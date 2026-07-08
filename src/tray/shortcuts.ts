// 트레이 인패널 단축키 매핑 — 순수 함수(DOM 비의존). TrayApp/TrayGame keydown 리스너가 소비.
// 참조: 요트다이스 popup.html 의 Space/Esc 처리를 스플랜더 조작에 맞게 확장.
import { GEM_COLORS } from '../engine'

export type TrayScreen = 'setup' | 'game' | 'result'
export type PlayPhaseKind = 'play' | 'discard' | 'chooseNoble' | 'gameOver'

export interface ShortcutInput {
  key: string
  hasModifier: boolean // Ctrl/Alt/Meta 중 하나라도 눌렸는지
}

export interface ShortcutContext {
  popoverOpen: boolean
  screen: TrayScreen
  phase: PlayPhaseKind
  myTurn: boolean
  passOnly: boolean
  undoable: boolean
  hasPending: boolean
}

export type ShortcutAction =
  | { type: 'none' }
  | { type: 'closePopover' }
  | { type: 'hide' }
  | { type: 'toggleExpand'; panel: 'board' | 'opponents' | 'nobles' }
  | { type: 'toggleLang' }
  | { type: 'undo' }
  | { type: 'confirm' }
  | { type: 'pass' }
  | { type: 'pick'; index: number } // GEM_COLORS 인덱스 0..4

const NONE: ShortcutAction = { type: 'none' }

/** keydown 을 트레이 조작 액션으로 매핑한다(순수). 대소문자 무시, 수식키 조합은 무시(Esc 제외). */
export function resolveShortcut(input: ShortcutInput, ctx: ShortcutContext): ShortcutAction {
  const { key, hasModifier } = input
  // Esc 는 수식키 무관하게 최우선 처리(팝오버 우선 닫기 → 아니면 숨기기).
  if (key === 'Escape') {
    return ctx.popoverOpen ? { type: 'closePopover' } : { type: 'hide' }
  }
  // 그 외 단축키는 수식키 조합이면 무시(OS·앱 복사/붙여넣기 등 보호).
  if (hasModifier) return NONE
  // 조작 단축키는 게임 화면에서만.
  if (ctx.screen !== 'game') return NONE

  const k = key.toLowerCase()
  switch (k) {
    case 'b': return { type: 'toggleExpand', panel: 'board' }
    case 'o': return { type: 'toggleExpand', panel: 'opponents' }
    case 'n': return { type: 'toggleExpand', panel: 'nobles' }
    case 'l': return { type: 'toggleLang' }
    case 'u': return ctx.undoable ? { type: 'undo' } : NONE
    case 'enter': return ctx.hasPending ? { type: 'confirm' } : NONE
    case 'p': return ctx.myTurn && ctx.passOnly ? { type: 'pass' } : NONE
    default: break
  }
  // 숫자키 1..5 → 토큰 집기(내 차례·play 페이즈에서만).
  if (k >= '1' && k <= '5') {
    if (ctx.myTurn && ctx.phase === 'play') {
      const index = Number(k) - 1
      if (index < GEM_COLORS.length) return { type: 'pick', index }
    }
    return NONE
  }
  return NONE
}
