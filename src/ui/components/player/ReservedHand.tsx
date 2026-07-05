import type { CardId, PlayerState } from '../../../engine'
import { CardView } from '../board/CardView'

/**
 * 예약 카드 — 현재 차례 본인 것만 앞면 조작 가능.
 * 타인의 덱 비공개 예약은 playerView 마스킹(HIDDEN_CARD)으로 DOM에조차 없다 (RULES §9-O)
 */
export function ReservedHand({
  player,
  ownHand,
  selectedCard,
  onSelect,
}: {
  player: PlayerState
  ownHand: boolean
  selectedCard: CardId | null
  onSelect?: (id: CardId | null) => void
}) {
  if (player.reserved.length === 0) return null
  return (
    <div className="reserved-hand" aria-label={`예약 카드 ${player.reserved.length}장`}>
      {player.reserved.map((r, i) => (
        <CardView
          key={i}
          cardId={r.cardId}
          mini
          selected={ownHand && selectedCard === r.cardId}
          onClick={
            ownHand && onSelect && r.cardId >= 0
              ? () => onSelect(selectedCard === r.cardId ? null : r.cardId)
              : undefined
          }
        />
      ))}
    </div>
  )
}
