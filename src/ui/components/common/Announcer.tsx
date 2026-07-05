import type { GameEvent, GameState } from '../../../engine'
import { describeEvent } from '../../i18n/ko'

/**
 * aria-live 낭독 — 직전 액션의 이벤트 묶음 전체를 이어 붙여 낭독한다.
 * (마지막 이벤트만 낭독하면 행동 내용이 '…의 차례'에 묻힌다 — 로그와 같은 문장 사용)
 */
export function Announcer({
  lastEvents,
  state,
}: {
  lastEvents: readonly GameEvent[]
  state: GameState
}) {
  return (
    <div aria-live="polite" className="visually-hidden">
      {lastEvents.map((e) => describeEvent(e, state)).join('. ')}
    </div>
  )
}
