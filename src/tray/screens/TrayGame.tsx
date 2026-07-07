import { useEffect } from 'react'
import { CARDS, GEM_COLORS, NOBLES, TOKEN_COLORS, WINNING_PRESTIGE, type GameState } from '../../engine'
import { useGameStore, viewerIndexFor } from '../../store/gameStore'
import { cardCode, gemCode, playerLine } from '../format'
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

function BoardPanel({ committed, lang }: { committed: GameState; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="board" aria-label="보드">
      {([3, 2, 1] as const).map((tier) => {
        const row = committed.board[tier - 1]!
        const deckLeft = committed.decks[tier - 1]!.length
        return (
          <div className="tray-tier" data-tray-tier={tier} key={tier}>
            <span className="tray-tier-label">T{tier}</span>
            {row.map((id, slot) => (
              <span className="tray-cardcell" data-card-id={id ?? ''} key={slot}>
                {id !== null ? cardCode(CARDS[id]!, lang) : '·'}
              </span>
            ))}
            <span className="tray-deckleft">덱{deckLeft}</span>
          </div>
        )
      })}
      <div className="tray-supply" data-tray-supply aria-label="토큰 공급">
        {TOKEN_COLORS.filter((c) => committed.supply[c] > 0).map((c) => (
          <span className="tray-supplycell" key={c}>
            {gemCode(c, lang)}
            {committed.supply[c]}
          </span>
        ))}
      </div>
    </section>
  )
}

function OpponentsPanel({ committed, me, lang }: { committed: GameState; me: number; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="opponents" aria-label="상대">
      {committed.players.map((_, i) =>
        i === me ? null : (
          <div className="tray-opp" data-opp-index={i} key={i}>
            <span className="tray-opp-name">{committed.config.players[i]!.name}</span>
            <span className="tray-opp-line">{playerLine(committed, i, lang)}</span>
          </div>
        ),
      )}
    </section>
  )
}

function NoblesPanel({ committed, lang }: { committed: GameState; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="nobles" aria-label="귀족">
      {committed.nobles.map((id) => {
        const req = NOBLES[id]!.requirement
        return (
          <div className="tray-noble" data-noble-id={id} key={id}>
            👑{' '}
            {GEM_COLORS.filter((c) => req[c] > 0)
              .map((c) => `${gemCode(c, lang)}${req[c]}`)
              .join(' ')}
          </div>
        )
      })}
    </section>
  )
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

      {expand.board && <BoardPanel committed={committed} lang={gemCodeLang} />}
      {expand.opponents && <OpponentsPanel committed={committed} me={me} lang={gemCodeLang} />}
      {expand.nobles && <NoblesPanel committed={committed} lang={gemCodeLang} />}
    </main>
  )
}
