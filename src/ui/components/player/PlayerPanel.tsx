import { GEM_COLORS, TOKEN_COLORS, type GameState } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { GemIcon } from '../common/GemIcon'
import { ReservedHand } from './ReservedHand'

/** 플레이어 요약 — 점수/토큰/보너스/예약/귀족 (전원 공개 정보, RULES §9-O) */
export function PlayerPanel({ view, index }: { view: GameState; index: number }) {
  const player = view.players[index]!
  const kind = view.config.players[index]!
  const isCurrent = view.currentPlayer === index
  const selectedCard = useGameStore((s) => s.selectedCard)
  const selectCard = useGameStore((s) => s.selectCard)

  return (
    <section
      className={`player-panel ${isCurrent ? 'player-current' : ''}`}
      aria-label={`${kind.name} 현황`}
      data-player-index={index}
    >
      <header className="player-header">
        <span className="player-name">
          {isCurrent && <span className="turn-marker" aria-hidden />}
          {kind.name}
        </span>
        <span className="player-prestige" aria-label={`${player.prestige}점`}>
          {player.prestige}점
        </span>
      </header>

      <div className="player-tokens" aria-label="보유 토큰">
        {TOKEN_COLORS.filter((c) => player.tokens[c] > 0).map((c) => (
          <span key={c} className="mini-chip">
            <GemIcon color={c} size={13} />
            {player.tokens[c]}
          </span>
        ))}
      </div>

      <div className="player-bonuses" aria-label="보너스 (구매 카드 할인)">
        {GEM_COLORS.map((g) =>
          player.bonuses[g] > 0 ? (
            <span key={g} className={`bonus-chip bonus-${g}`}>
              <GemIcon color={g} size={13} />
              {player.bonuses[g]}
            </span>
          ) : null,
        )}
        {player.nobles.length > 0 && (
          <span className="mini-chip noble-chip" aria-label={`귀족 ${player.nobles.length}장`}>
            👑 {player.nobles.length}
          </span>
        )}
      </div>

      <ReservedHand
        player={player}
        ownHand={isCurrent}
        selectedCard={selectedCard}
        onSelect={isCurrent ? selectCard : undefined}
      />
    </section>
  )
}
