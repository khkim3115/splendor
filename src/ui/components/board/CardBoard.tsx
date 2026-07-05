import type { GameState } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { CardView } from './CardView'
import { DeckPile } from './DeckPile'

/** 티어 3(위) → 1(아래) 순의 공개 카드 보드 (RULES §2) */
export function CardBoard({ view }: { view: GameState }) {
  const selectedCard = useGameStore((s) => s.selectedCard)
  const selectCard = useGameStore((s) => s.selectCard)

  return (
    <div className="card-board">
      {([3, 2, 1] as const).map((tier) => (
        <div key={tier} className="board-row" data-tier={tier}>
          <DeckPile tier={tier} remaining={view.decks[tier - 1]!.length} />
          {view.board[tier - 1]!.map((cardId, slot) =>
            cardId === null ? (
              <div key={slot} className="card card-empty" aria-label={`${tier}티어 빈자리`} />
            ) : (
              <CardView
                key={slot}
                cardId={cardId}
                selected={selectedCard === cardId}
                onClick={() => selectCard(selectedCard === cardId ? null : cardId)}
              />
            ),
          )}
        </div>
      ))}
    </div>
  )
}
