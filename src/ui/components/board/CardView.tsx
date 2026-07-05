import { GEM_COLORS, CARDS, HIDDEN_CARD, type CardId } from '../../../engine'
import { cardKo } from '../../i18n/ko'
import { GemIcon } from '../common/GemIcon'

interface CardViewProps {
  cardId: CardId
  mini?: boolean
  selected?: boolean
  onClick?: () => void
}

/** 개발 카드 — 오리지널 CSS/SVG 비주얼 (기능 데이터만 원작과 동일) */
export function CardView({ cardId, mini, selected, onClick }: CardViewProps) {
  if (cardId === HIDDEN_CARD || !CARDS[cardId]) {
    return <div className={`card card-back ${mini ? 'card-mini' : ''}`} aria-label="비공개 카드" />
  }
  const card = CARDS[cardId]
  const costs = GEM_COLORS.filter((g) => card.cost[g] > 0)

  return (
    <button
      type="button"
      className={`card card-${card.bonus} ${mini ? 'card-mini' : ''} ${selected ? 'card-selected' : ''}`}
      onClick={onClick}
      aria-label={cardKo(cardId)}
      aria-pressed={selected}
      data-card-id={cardId}
    >
      <div className="card-top">
        <span className="card-points">{card.points > 0 ? card.points : ''}</span>
        <GemIcon color={card.bonus} size={mini ? 14 : 22} />
      </div>
      <div className="card-costs">
        {costs.map((g) => (
          <span key={g} className={`cost-chip cost-${g}`}>
            <GemIcon color={g} size={mini ? 10 : 14} />
            <b>{card.cost[g]}</b>
          </span>
        ))}
      </div>
    </button>
  )
}
