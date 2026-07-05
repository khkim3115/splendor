import { useGameStore } from '../../../store/gameStore'

/** 덱 더미 — 클릭 = 비공개 예약 선택 (RULES §4.3), 잔량 뱃지 표시 */
export function DeckPile({ tier, remaining }: { tier: 1 | 2 | 3; remaining: number }) {
  const selectedDeck = useGameStore((s) => s.selectedDeck)
  const selectDeck = useGameStore((s) => s.selectDeck)
  const empty = remaining === 0

  return (
    <button
      type="button"
      className={`card deck-pile deck-tier-${tier} ${empty ? 'deck-empty' : ''} ${selectedDeck === tier ? 'card-selected' : ''}`}
      disabled={empty}
      onClick={() => selectDeck(selectedDeck === tier ? null : tier)}
      aria-label={`${tier}티어 덱 (${remaining}장 남음)${empty ? ' — 소진' : ''}`}
      aria-pressed={selectedDeck === tier}
    >
      <span className="deck-tier-label">{'●'.repeat(tier)}</span>
      <span className="deck-count">{remaining}</span>
    </button>
  )
}
