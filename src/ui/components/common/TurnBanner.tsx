import type { GameState } from '../../../engine'

export function TurnBanner({ view }: { view: GameState }) {
  const name = view.config.players[view.currentPlayer]?.name ?? ''
  return (
    <div className="turn-banner">
      <span className="turn-name">{name}님의 차례</span>
      {view.finalRound && <span className="final-round-badge">마지막 라운드!</span>}
    </div>
  )
}
