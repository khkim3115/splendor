// 행동 확정 바 — UI는 후보 액션을 조립하고 엔진의 validateAction 결과로만
// 활성화·사유를 결정한다 (룰 리터럴 금지, docs/ARCHITECTURE.md §4 경계 규약)

import {
  CARDS,
  canonicalPayment,
  legalActions,
  paymentBounds,
  validateAction,
  type Action,
  type CardId,
  type GameState,
} from '../../../engine'
import { buildPickAction, useGameStore } from '../../../store/gameStore'
import { cardKo } from '../../i18n/ko'
import { GemIcon } from './GemIcon'

function reasonOf(view: GameState, action: Action): string | null {
  const v = validateAction(view, action)
  return v.ok ? null : `${v.messageKo} (${v.rule})`
}

export function ActionBar({
  view,
  onAdjustPayment,
}: {
  view: GameState
  onAdjustPayment: (cardId: CardId) => void
}) {
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const selectedCard = useGameStore((s) => s.selectedCard)
  const selectedDeck = useGameStore((s) => s.selectedDeck)
  const dispatch = useGameStore((s) => s.dispatch)
  const clearSelection = useGameStore((s) => s.clearSelection)
  const lastError = useGameStore((s) => s.lastError)
  const dismissError = useGameStore((s) => s.dismissError)

  if (view.phase.kind !== 'play') return null
  const me = view.currentPlayer
  const player = view.players[me]!

  let content: React.ReactNode = null

  if (pendingPicks.length > 0) {
    const action = buildPickAction(pendingPicks)!
    const reason = reasonOf(view, action)
    content = (
      <>
        <span className="actionbar-summary">
          선택한 토큰:{' '}
          {pendingPicks.map((c, i) => (
            <GemIcon key={i} color={c} size={18} />
          ))}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={reason !== null}
          title={reason ?? undefined}
          onClick={() => dispatch(action)}
        >
          가져오기 확정
        </button>
        {reason && <span className="actionbar-reason">{reason}</span>}
        <button type="button" className="btn" onClick={clearSelection}>
          취소
        </button>
      </>
    )
  } else if (selectedCard !== null && CARDS[selectedCard]) {
    const card = CARDS[selectedCard]
    const inReserve = player.reserved.some((r) => r.cardId === selectedCard)
    const purchase: Action = {
      type: 'PURCHASE',
      cardId: selectedCard,
      payment: canonicalPayment(player, card),
    }
    const purchaseReason = reasonOf(view, purchase)
    const reserve: Action = { type: 'RESERVE_BOARD', cardId: selectedCard }
    const reserveReason = inReserve ? '이미 예약한 카드입니다' : reasonOf(view, reserve)
    const bounds = paymentBounds(view, me, selectedCard)
    const canAdjust =
      purchaseReason === null &&
      bounds.goldFlexibleColors.length > 0 &&
      player.tokens.gold > bounds.minGold

    content = (
      <>
        <span className="actionbar-summary">{cardKo(selectedCard)}</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={purchaseReason !== null}
          title={purchaseReason ?? undefined}
          onClick={() => dispatch(purchase)}
        >
          구매
        </button>
        {canAdjust && (
          <button type="button" className="btn" onClick={() => onAdjustPayment(selectedCard)}>
            지불 조정…
          </button>
        )}
        {!inReserve && (
          <button
            type="button"
            className="btn"
            disabled={reserveReason !== null}
            title={reserveReason ?? undefined}
            onClick={() => dispatch(reserve)}
          >
            예약
          </button>
        )}
        {(purchaseReason ?? (inReserve ? null : reserveReason)) && (
          <span className="actionbar-reason">{purchaseReason ?? reserveReason}</span>
        )}
        <button type="button" className="btn" onClick={clearSelection}>
          취소
        </button>
      </>
    )
  } else if (selectedDeck !== null) {
    const action: Action = { type: 'RESERVE_DECK', tier: selectedDeck }
    const reason = reasonOf(view, action)
    content = (
      <>
        <span className="actionbar-summary">{selectedDeck}티어 덱 맨 위 카드</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={reason !== null}
          title={reason ?? undefined}
          onClick={() => dispatch(action)}
        >
          비공개 예약
        </button>
        {reason && <span className="actionbar-reason">{reason}</span>}
        <button type="button" className="btn" onClick={clearSelection}>
          취소
        </button>
      </>
    )
  } else {
    const legal = legalActions(view)
    const passOnly = legal.length === 1 && legal[0]!.type === 'PASS'
    content = passOnly ? (
      <>
        <span className="actionbar-summary">가능한 행동이 없습니다 (§9-G)</span>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'PASS' })}>
          패스
        </button>
      </>
    ) : (
      <span className="actionbar-hint">
        토큰 더미를 클릭해 모으거나, 카드를 클릭해 구매·예약하세요
      </span>
    )
  }

  return (
    <div className="action-bar">
      {content}
      {lastError && (
        <button type="button" className="error-toast" onClick={dismissError} aria-live="assertive">
          ⚠ {lastError} (닫기)
        </button>
      )}
    </div>
  )
}
