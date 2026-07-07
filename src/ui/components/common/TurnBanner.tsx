import type { GameState } from '../../../engine'
import { roundNumber } from '../../round'
import { AiThinkingBadge } from './AiThinkingIndicator'

export function TurnBanner({
  view,
  aiThinking,
  canUndo,
  onUndo,
}: {
  view: GameState
  aiThinking: boolean
  canUndo: boolean
  onUndo: () => void
}) {
  const kind = view.config.players[view.currentPlayer]
  const name = kind?.name ?? ''
  return (
    <div className="turn-banner">
      <span className="turn-round" role="status" aria-live="polite" aria-atomic="true">
        {roundNumber(view)}라운드
      </span>
      <span className="turn-name">{name}님의 차례</span>
      {kind?.type === 'ai' && <AiThinkingBadge thinking={aiThinking} />}
      {view.finalRound && <span className="final-round-badge">마지막 라운드!</span>}
      {canUndo && (
        <button type="button" className="btn btn-undo" onClick={onUndo}>
          ↩ 한 수 무르기
        </button>
      )}
    </div>
  )
}
