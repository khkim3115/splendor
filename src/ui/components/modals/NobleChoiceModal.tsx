import type { GameState } from '../../../engine'
import { useGameStore } from '../../../store/gameStore'
import { NobleTile } from '../board/NobleRow'

/** §9-J 귀족 선택 — 복수 충족 시 강제 오픈 (방문 거부 불가이므로 닫기 버튼 없음) */
export function NobleChoiceModal({ view }: { view: GameState }) {
  const dispatch = useGameStore((s) => s.dispatch)
  if (view.phase.kind !== 'chooseNoble') return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="귀족 선택">
      <div className="modal">
        <h2>귀족 방문 (§6)</h2>
        <p>여러 귀족의 조건을 동시에 충족했습니다. 이번 턴에 맞이할 귀족 한 분을 선택하세요.</p>
        <div className="noble-choice-grid">
          {view.phase.options.map((nobleId) => (
            <button
              key={nobleId}
              type="button"
              className="noble-choice"
              onClick={() => dispatch({ type: 'CHOOSE_NOBLE', nobleId })}
            >
              <NobleTile nobleId={nobleId} />
              <span className="btn btn-primary">이 귀족 맞이하기</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
