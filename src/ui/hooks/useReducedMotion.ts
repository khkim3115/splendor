import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 접근성·연출 게이트 (docs/ROADMAP.md M7).
 *
 * matchMedia가 없는 환경(jsdom 테스트)은 **연출 없음(reduce)** 으로 취급한다 —
 * 이것이 "reduced-motion이면 기존 무연출 경로 = 테스트 경로 유지"라는 DoD의 구현점이다.
 * 실제 브라우저에서는 OS 설정을 그대로 따르며, 설정 변경도 실시간 반영한다.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(QUERY).matches
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
