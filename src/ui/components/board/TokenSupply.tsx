import { GEM_COLORS, type GameState } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { COLOR_KO } from '../../i18n/ko'
import { GemIcon } from '../common/GemIcon'

/** 토큰 공급처 — 클릭 토글로 집기 조립 (docs/ARCHITECTURE.md §5 인터랙션) */
export function TokenSupply({ view }: { view: GameState }) {
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const togglePick = useGameStore((s) => s.togglePick)
  const isPlaying = view.phase.kind === 'play'

  return (
    <div className="token-supply" aria-label="토큰 공급처">
      {GEM_COLORS.map((color) => {
        const remaining = view.supply[color] - pendingPicks.filter((c) => c === color).length
        const picked = pendingPicks.filter((c) => c === color).length
        return (
          <button
            key={color}
            type="button"
            className={`token-pile token-${color} ${picked > 0 ? 'token-picked' : ''}`}
            disabled={!isPlaying || (remaining <= 0 && picked === 0)}
            onClick={() => togglePick(color)}
            aria-label={`${COLOR_KO[color]} 토큰 ${remaining}개${picked > 0 ? ` (${picked}개 선택됨)` : ''}`}
          >
            <GemIcon color={color} size={26} />
            <span className="token-count">{remaining}</span>
            {picked > 0 && <span className="token-picked-badge">{picked}</span>}
          </button>
        )
      })}
      <div className="token-pile token-gold-pile" aria-label={`황금 토큰 ${view.supply.gold}개 (예약으로만 획득)`}>
        <GemIcon color="gold" size={26} />
        <span className="token-count">{view.supply.gold}</span>
      </div>
    </div>
  )
}
