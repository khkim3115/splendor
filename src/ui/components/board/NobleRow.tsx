import { GEM_COLORS, NOBLES, type GameState, type NobleId } from '../../../engine'
import { nobleKo } from '../../i18n/ko'
import { GemIcon } from '../common/GemIcon'

export function NobleTile({ nobleId }: { nobleId: NobleId }) {
  const noble = NOBLES[nobleId]
  if (!noble) return null
  return (
    <div className="noble-tile" aria-label={nobleKo(nobleId)}>
      <span className="noble-points">3</span>
      <div className="noble-reqs">
        {GEM_COLORS.filter((g) => noble.requirement[g] > 0).map((g) => (
          <span key={g} className="noble-req">
            <GemIcon color={g} size={12} />
            <b>{noble.requirement[g]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** 공개 귀족 타일 (감소만 함, RULES §6) */
export function NobleRow({ view }: { view: GameState }) {
  return (
    <div className="noble-row" aria-label="귀족 타일">
      {view.nobles.map((id) => (
        <NobleTile key={id} nobleId={id} />
      ))}
    </div>
  )
}
