import { useEffect } from 'react'
import { WINNING_PRESTIGE, type GameState } from '../../engine'
import { useGameStore, viewerIndexFor } from '../../store/gameStore'
import { playerLine } from '../format'
import { useTraySettings, type TrayExpand } from '../useTraySettings'

const PANEL_LABEL: Record<keyof TrayExpand, string> = {
  board: '보드',
  opponents: '상대',
  nobles: '귀족',
}

/** 펼침 조합에 맞는 목표 창 크기(px). 스펙 §화면 상태 표를 근사한다. */
function targetSize(expand: TrayExpand): { w: number; h: number } {
  const w = expand.opponents ? 392 : expand.board || expand.nobles ? 260 : 250
  let h = 178
  if (expand.board || expand.opponents) h = 440
  if (expand.nobles) h += 96
  return { w, h }
}

export function TrayGame({ committed }: { committed: GameState }) {
  const aiThinking = useGameStore((s) => s.aiThinking)
  const { gemCodeLang, setGemLang, expand, toggleExpand } = useTraySettings()

  const me = viewerIndexFor(committed)
  const myTurn = committed.config.players[committed.currentPlayer]?.type === 'human'
  const myScore = committed.players[me]!.prestige

  // 펼침 조합이 바뀌면 셸에 리사이즈 요청 (브라우저에선 window.tray가 없어 no-op)
  useEffect(() => {
    const { w, h } = targetSize(expand)
    window.tray?.resize(w, h)
  }, [expand])

  return (
    <main className="tray-game" data-tray-screen="game">
      <header className="tray-status">
        <span className="tray-turn">
          {myTurn ? '▸ 내 차례' : aiThinking ? 'AI 생각 중…' : 'AI 차례'}
        </span>
        <span className="tray-score">
          {myScore} / {WINNING_PRESTIGE}
        </span>
        <button
          type="button"
          className="tray-lang"
          aria-label="글자코드 언어 전환"
          onClick={() => setGemLang(gemCodeLang === 'ko' ? 'en' : 'ko')}
        >
          {gemCodeLang === 'ko' ? '한' : 'EN'}
        </button>
      </header>

      <div className="tray-me">{playerLine(committed, me, gemCodeLang)}</div>

      <nav className="tray-toggles" aria-label="펼침">
        {(Object.keys(PANEL_LABEL) as (keyof TrayExpand)[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`tray-toggle ${expand[k] ? 'is-open' : ''}`}
            aria-pressed={expand[k]}
            onClick={() => toggleExpand(k)}
          >
            {PANEL_LABEL[k]}
          </button>
        ))}
      </nav>

      {expand.board && (
        <section className="tray-panel" data-tray-panel="board" aria-label="보드">
          {/* Task 7에서 채운다 */}
        </section>
      )}
      {expand.opponents && (
        <section className="tray-panel" data-tray-panel="opponents" aria-label="상대">
          {/* Task 8에서 채운다 */}
        </section>
      )}
      {expand.nobles && (
        <section className="tray-panel" data-tray-panel="nobles" aria-label="귀족">
          {/* Task 8에서 채운다 */}
        </section>
      )}
    </main>
  )
}
