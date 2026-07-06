import type { GameState } from '../../../engine'
import { useGameStore, viewerIndexFor } from '../../../store/gameStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * 핫시트 기기 전달 오버레이 — 표시 중 화면은 이미 "기기를 들 사람"의
 * playerView 기준으로 렌더된다 (배경 완전 불투명 — §9-O).
 * 로드 직후 등 AI 차례에 게이트가 선 경우에는 사람(뷰 주인)을 지목한다 —
 * AI에게 기기를 넘기라는 안내는 §9-O 게이트를 무력화한다 (M5 리뷰 확정).
 */
export function HandoffOverlay({ view }: { view: GameState }) {
  const acknowledgeHandoff = useGameStore((s) => s.acknowledgeHandoff)
  const trapRef = useFocusTrap<HTMLDivElement>()
  const current = view.config.players[view.currentPlayer]
  const isAiTurn = current?.type === 'ai'
  const holder = isAiTurn
    ? view.config.players[viewerIndexFor(view)]?.name ?? ''
    : current?.name ?? ''

  return (
    <div className="modal-backdrop handoff" role="dialog" aria-modal="true" aria-label="기기 전달">
      <div className="modal handoff-modal" ref={trapRef}>
        <h2>{isAiTurn ? '게임 재개' : '기기를 전달하세요'}</h2>
        <p>
          {isAiTurn ? (
            <>
              지금은 <b>{current?.name}</b>의 차례입니다. <b>{holder}</b>님이 확인해 주세요.
            </>
          ) : (
            <>
              다음 차례: <b>{holder}</b>
            </>
          )}
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={acknowledgeHandoff}>
          {holder} 준비 완료 — {isAiTurn ? '계속' : '시작'}
        </button>
      </div>
    </div>
  )
}
