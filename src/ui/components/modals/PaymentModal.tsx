import { useState } from 'react'
import {
  CARDS,
  GEM_COLORS,
  canonicalPayment,
  isValidPayment,
  paymentBounds,
  type CardId,
  type GameState,
  type GemColor,
  type TokenMap,
} from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { COLOR_KO, cardKo } from '../../i18n/ko'
import { GemIcon } from '../common/GemIcon'

const ZERO_EXTRA: Record<GemColor, number> = { white: 0, blue: 0, green: 0, red: 0, black: 0 }

/** §9-L 황금 배분 조정 — 보석 지불 일부를 황금으로 대체 */
export function PaymentModal({
  view,
  cardId,
  onClose,
}: {
  view: GameState
  cardId: CardId
  onClose: () => void
}) {
  const dispatch = useGameStore((s) => s.dispatch)
  const [extra, setExtra] = useState<Record<GemColor, number>>(ZERO_EXTRA)

  const card = CARDS[cardId]
  if (!card) return null
  const player = view.players[view.currentPlayer]!
  const canonical = canonicalPayment(player, card)
  const bounds = paymentBounds(view, view.currentPlayer, cardId)

  const extraTotal = GEM_COLORS.reduce((s, g) => s + extra[g], 0)
  const payment: TokenMap = {
    white: canonical.white - extra.white,
    blue: canonical.blue - extra.blue,
    green: canonical.green - extra.green,
    red: canonical.red - extra.red,
    black: canonical.black - extra.black,
    gold: canonical.gold + extraTotal,
  }
  const valid = isValidPayment(player, card, payment)
  const spareGold = player.tokens.gold - canonical.gold - extraTotal

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="지불 조정">
      <div className="modal">
        <h2>지불 조정 (§9-L)</h2>
        <p>
          {cardKo(cardId)} — 보석 대신 황금으로 지불할 수 있습니다. (여분 황금 {spareGold}개)
        </p>
        <div className="discard-grid">
          {bounds.goldFlexibleColors.map((g) => (
            <div key={g} className="discard-row">
              <GemIcon color={g} size={22} />
              <span className="discard-holding">
                {COLOR_KO[g]} 지불 {payment[g]}개 + 황금 대체 {extra[g]}개
              </span>
              <button
                type="button"
                className="btn btn-step"
                aria-label={`${COLOR_KO[g]} 황금 대체 줄이기`}
                disabled={extra[g] === 0}
                onClick={() => setExtra({ ...extra, [g]: extra[g] - 1 })}
              >
                −
              </button>
              <b className="discard-count">{extra[g]}</b>
              <button
                type="button"
                className="btn btn-step"
                aria-label={`${COLOR_KO[g]} 황금으로 대체`}
                disabled={canonical[g] - extra[g] <= 0 || spareGold <= 0}
                onClick={() => setExtra({ ...extra, [g]: extra[g] + 1 })}
              >
                +
              </button>
            </div>
          ))}
        </div>
        <footer className="modal-footer">
          <span>
            지불: {GEM_COLORS.filter((g) => payment[g] > 0).map((g) => `${COLOR_KO[g]} ${payment[g]}`).join(', ')}
            {payment.gold > 0 ? `${GEM_COLORS.some((g) => payment[g] > 0) ? ', ' : ''}황금 ${payment.gold}` : ''}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              dispatch({ type: 'PURCHASE', cardId, payment })
              onClose()
            }}
          >
            이 구성으로 구매
          </button>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  )
}
