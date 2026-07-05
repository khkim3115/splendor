import type { GameState } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'

/**
 * 핫시트 기기 전달 오버레이 — 표시 중 화면은 이미 다음 플레이어의
 * playerView 기준으로 렌더된다 (이전 플레이어의 비공개 정보는 DOM에 없음)
 */
export function HandoffOverlay({ view }: { view: GameState }) {
  const acknowledgeHandoff = useGameStore((s) => s.acknowledgeHandoff)
  const name = view.config.players[view.currentPlayer]?.name ?? ''

  return (
    <div className="modal-backdrop handoff" role="dialog" aria-modal="true" aria-label="기기 전달">
      <div className="modal handoff-modal">
        <h2>기기를 전달하세요</h2>
        <p>
          다음 차례: <b>{name}</b>
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={acknowledgeHandoff}>
          {name} 준비 완료 — 시작
        </button>
      </div>
    </div>
  )
}
