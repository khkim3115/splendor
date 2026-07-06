import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * 모달 포커스 순회 (docs/ROADMAP.md M7 — 키보드 포커스 순회).
 *
 * 열릴 때 첫 조작 요소로 포커스를 옮기고, Tab/Shift+Tab이 모달 밖으로 새지 않도록
 * 순환시키며, 닫힐 때 직전 포커스를 복원한다. `onEscape`가 주어진 모달만 Esc로 닫힌다
 * (반납·귀족·핸드오프처럼 거부 불가한 모달은 onEscape를 주지 않아 Esc를 무시한다).
 */
export function useFocusTrap<T extends HTMLElement>(
  onEscape?: () => void,
): React.RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    // 열리면 첫 조작 요소(없으면 컨테이너 자신)로 포커스 이동
    const first = focusables()[0]
    if (first) first.focus()
    else {
      node.tabIndex = -1
      node.focus()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault()
        firstItem.focus()
      } else if (active instanceof Node && !node.contains(active)) {
        // 포커스가 어쩌다 밖에 있으면 되끌어온다
        e.preventDefault()
        firstItem.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // 닫힐 때 직전 포커스 복원 (여전히 문서에 있을 때만)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [onEscape])

  return ref
}
