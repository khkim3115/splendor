import type { GameEvent, GameState } from '../../../engine'
import { describeEvent } from '../../i18n/ko'

/**
 * aria-live 낭독 (docs/ROADMAP.md M7 — 낭독 문장 다듬기).
 *
 * 직전 액션의 이벤트 묶음 전체를 한 덩어리로 낭독한다. aria-atomic="true"라
 * 스크린리더가 부분이 아니라 문장 전체를 새로 읽으며, role="status"로 진행 상황을
 * 방해 없이(polite) 전달한다. 로그 패널과 같은 describeEvent() 문장을 써
 * "보이는 것 = 낭독되는 것"을 유지한다.
 */
export function Announcer({
  lastEvents,
  state,
}: {
  lastEvents: readonly GameEvent[]
  state: GameState
}) {
  const sentence = lastEvents.map((e) => describeEvent(e, state)).join('. ')
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
      {sentence === '' ? '' : `${sentence}.`}
    </div>
  )
}
