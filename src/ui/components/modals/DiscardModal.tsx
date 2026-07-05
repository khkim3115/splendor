import { useState } from 'react'
import {
  TOKEN_COLORS,
  ZERO_TOKENS,
  tokenTotal,
  withTokenDelta,
  type GameState,
  type TokenMap,
} from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { COLOR_KO } from '../../i18n/ko'
import { GemIcon } from '../common/GemIcon'

/** §5 토큰 반납 — phase=discard 동안 강제 오픈 (닫기 불가) */
export function DiscardModal({ view }: { view: GameState }) {
  const dispatch = useGameStore((s) => s.dispatch)
  const [sel, setSel] = useState<TokenMap>(ZERO_TOKENS)
  if (view.phase.kind !== 'discard') return null

  const mustDiscard = view.phase.mustDiscard
  const player = view.players[view.currentPlayer]!
  const total = tokenTotal(sel)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="토큰 반납">
      <div className="modal">
        <h2>토큰 반납 (§5)</h2>
        <p>
          토큰이 10개를 넘었습니다. <b>{mustDiscard}개</b>를 골라 반납하세요.
          방금 가져온 토큰을 그대로 반납해도 됩니다.
        </p>
        <div className="discard-grid">
          {TOKEN_COLORS.filter((c) => player.tokens[c] > 0).map((c) => (
            <div key={c} className="discard-row">
              <GemIcon color={c} size={22} />
              <span className="discard-holding">
                {COLOR_KO[c]} — 보유 {player.tokens[c]}개
              </span>
              <button
                type="button"
                className="btn btn-step"
                aria-label={`${COLOR_KO[c]} 반납 줄이기`}
                disabled={sel[c] === 0}
                onClick={() => setSel(withTokenDelta(sel, c, -1))}
              >
                −
              </button>
              <b className="discard-count">{sel[c]}</b>
              <button
                type="button"
                className="btn btn-step"
                aria-label={`${COLOR_KO[c]} 반납 늘리기`}
                disabled={sel[c] >= player.tokens[c] || total >= mustDiscard}
                onClick={() => setSel(withTokenDelta(sel, c, 1))}
              >
                +
              </button>
            </div>
          ))}
        </div>
        <footer className="modal-footer">
          <span>
            {total} / {mustDiscard}개 선택됨
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={total !== mustDiscard}
            onClick={() => dispatch({ type: 'DISCARD', tokens: sel })}
          >
            반납 확정
          </button>
        </footer>
      </div>
    </div>
  )
}
