import { useEffect, useState } from 'react'
import {
  CARDS,
  GEM_COLORS,
  NOBLES,
  TOKEN_COLORS,
  WINNING_PRESTIGE,
  canonicalPayment,
  legalActions,
  tokenTotal,
  withTokenDelta,
  type GameState,
  type TokenColor,
  type TokenMap,
} from '../../engine'
import { buildPickAction, canUndo, useGameStore, viewerIndexFor } from '../../store/gameStore'
import { cardCode, gemCode, playerLine } from '../format'
import { useTraySettings, type TrayExpand } from '../useTraySettings'
import { resolveShortcut } from '../shortcuts'

const PANEL_LABEL: Record<keyof TrayExpand, string> = {
  board: '보드',
  opponents: '상대',
  nobles: '귀족',
}

const ZERO: TokenMap = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }

/** 펼침 조합에 맞는 목표 창 크기(px). 스펙 §화면 상태 표를 근사한다. */
function targetSize(expand: TrayExpand): { w: number; h: number } {
  const w = expand.opponents ? 392 : expand.board || expand.nobles ? 260 : 250
  let h = 178
  if (expand.board || expand.opponents) h = 440
  if (expand.nobles) h += 96
  return { w, h }
}

function BoardPanel({
  committed,
  lang,
  onSelectCard,
  onSelectDeck,
}: {
  committed: GameState
  lang: 'ko' | 'en'
  onSelectCard: (id: number) => void
  onSelectDeck: (tier: 1 | 2 | 3) => void
}) {
  return (
    <section className="tray-panel" data-tray-panel="board" aria-label="보드">
      {([3, 2, 1] as const).map((tier) => {
        const row = committed.board[tier - 1]!
        const deckLeft = committed.decks[tier - 1]!.length
        return (
          <div className="tray-tier" data-tray-tier={tier} key={tier}>
            <span className="tray-tier-label">T{tier}</span>
            {row.map((id, slot) =>
              id !== null ? (
                <button
                  key={slot}
                  type="button"
                  className="tray-cardcell"
                  data-card-id={id}
                  onClick={() => onSelectCard(id)}
                >
                  {cardCode(CARDS[id]!, lang)}
                </button>
              ) : (
                <span key={slot} className="tray-cardcell" data-card-id="">
                  ·
                </span>
              ),
            )}
            <button
              type="button"
              className="tray-deckleft"
              disabled={deckLeft === 0}
              onClick={() => onSelectDeck(tier)}
            >
              덱{deckLeft}
            </button>
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
      {committed.players.map((_, i) => {
        if (i === me) return null
        const isCurrent = i === committed.currentPlayer
        return (
          <div
            className={`tray-opp${isCurrent ? ' tray-current is-current' : ''}`}
            data-opp-index={i}
            data-current={isCurrent ? 'true' : undefined}
            aria-current={isCurrent ? 'true' : undefined}
            key={i}
          >
            <span className="tray-opp-name">
              {isCurrent ? '▸ ' : ''}
              {committed.config.players[i]!.name}
            </span>
            <span className="tray-opp-line">{playerLine(committed, i, lang)}</span>
          </div>
        )
      })}
    </section>
  )
}

function NoblesPanel({ committed, lang }: { committed: GameState; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="nobles" aria-label="귀족">
      <span className="tray-panel-label">귀족</span>
      {committed.nobles.map((id) => {
        const noble = NOBLES[id]!
        const req = noble.requirement
        const score = lang === 'ko' ? `${noble.points}점` : `${noble.points}pt`
        const reqCode = GEM_COLORS.filter((c) => req[c] > 0)
          .map((c) => `${gemCode(c, lang)}${req[c]}`)
          .join(' ')
        return (
          <div className="tray-noble" data-noble-id={id} key={id}>
            {score} · {reqCode}
          </div>
        )
      })}
    </section>
  )
}

/** §4 행동 바 — 토큰 집기·구매·예약·비공개 예약·무르기, 합법 행동 공집합이면 패스 (§9-G) */
function PlayActions({
  committed,
  me,
  lang,
}: {
  committed: GameState
  me: number
  lang: 'ko' | 'en'
}) {
  const togglePick = useGameStore((s) => s.togglePick)
  const dispatch = useGameStore((s) => s.dispatch)
  const clearSelection = useGameStore((s) => s.clearSelection)
  const undo = useGameStore((s) => s.undo)
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const selectedCard = useGameStore((s) => s.selectedCard)
  const selectedDeck = useGameStore((s) => s.selectedDeck)
  const undoable = useGameStore((s) => canUndo(s))

  // 룰 판정은 엔진 몫 — 합법 행동 공집합이면 패스가 유일수 (§9-G)
  const legal = legalActions(committed)
  const passOnly = legal.length === 1 && legal[0]!.type === 'PASS'

  return (
    <div className="tray-actions" aria-label="행동">
      {passOnly ? (
        <div className="tray-passonly">
          <span className="tray-hint">가능한 행동 없음 (§9-G)</span>
          <button
            type="button"
            className="tray-btn tray-btn-primary"
            onClick={() => dispatch({ type: 'PASS' })}
          >
            패스
          </button>
        </div>
      ) : (
        <>
          <div className="tray-take">
            {GEM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="tray-take-btn"
                aria-label={`${gemCode(c, lang)} 집기`}
                onClick={() => togglePick(c)}
              >
                {gemCode(c, lang)}
              </button>
            ))}
          </div>
          {pendingPicks.length > 0 && (
            <div className="tray-pending">
              <span className="tray-pending-list">
                {pendingPicks.map((c) => gemCode(c, lang)).join('')}
              </span>
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() => {
                  const a = buildPickAction(pendingPicks)
                  if (a) dispatch(a)
                }}
              >
                확정
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {selectedCard !== null && CARDS[selectedCard] && (
            <div className="tray-cardaction">
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() =>
                  dispatch({
                    type: 'PURCHASE',
                    cardId: selectedCard,
                    payment: canonicalPayment(committed.players[me]!, CARDS[selectedCard]!),
                  })
                }
              >
                구매
              </button>
              <button
                type="button"
                className="tray-btn"
                onClick={() => dispatch({ type: 'RESERVE_BOARD', cardId: selectedCard })}
              >
                예약
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {selectedDeck !== null && (
            <div className="tray-cardaction">
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() => dispatch({ type: 'RESERVE_DECK', tier: selectedDeck })}
              >
                비공개 예약
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {undoable && (
            <button type="button" className="tray-btn tray-undo" onClick={undo}>
              무르기
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** §5 토큰 반납 — 10개 초과 시 강제. 색 버튼으로 조립 후 확정 dispatch(DISCARD) */
function DiscardActions({
  committed,
  me,
  lang,
  mustDiscard,
}: {
  committed: GameState
  me: number
  lang: 'ko' | 'en'
  mustDiscard: 1 | 2 | 3
}) {
  const dispatch = useGameStore((s) => s.dispatch)
  const [sel, setSel] = useState<TokenMap>(ZERO)
  const held = committed.players[me]!.tokens
  const total = tokenTotal(sel)

  const bump = (c: TokenColor, d: number) => setSel((prev) => withTokenDelta(prev, c, d))

  return (
    <div className="tray-actions" aria-label="반납">
      <span className="tray-hint">
        토큰 {mustDiscard}개 반납 ({total}/{mustDiscard})
      </span>
      <div className="tray-take">
        {TOKEN_COLORS.filter((c) => held[c] > 0).map((c) => (
          <button
            key={c}
            type="button"
            className="tray-take-btn"
            aria-label={`${gemCode(c, lang)} 반납`}
            disabled={sel[c] >= held[c] || total >= mustDiscard}
            onClick={() => bump(c, 1)}
          >
            {gemCode(c, lang)}
            {sel[c] > 0 ? sel[c] : ''}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="tray-btn tray-btn-primary"
        disabled={total !== mustDiscard}
        onClick={() => dispatch({ type: 'DISCARD', tokens: sel })}
      >
        반납 확정
      </button>
      {total > 0 && (
        <button type="button" className="tray-btn" onClick={() => setSel(ZERO)}>
          되돌리기
        </button>
      )}
    </div>
  )
}

/** §9-J 귀족 선택 — 복수 충족 시 강제. 하나 고르면 dispatch(CHOOSE_NOBLE) */
function NobleChoiceActions({
  options,
  lang,
}: {
  options: readonly number[]
  lang: 'ko' | 'en'
}) {
  const dispatch = useGameStore((s) => s.dispatch)
  return (
    <div className="tray-actions" aria-label="귀족 선택">
      <span className="tray-hint">귀족 선택 (§9-J)</span>
      {options.map((id) => {
        const req = NOBLES[id]!.requirement
        const reqCode = GEM_COLORS.filter((c) => req[c] > 0)
          .map((c) => `${gemCode(c, lang)}${req[c]}`)
          .join(' ')
        return (
          <button
            key={id}
            type="button"
            className="tray-btn tray-btn-primary"
            data-noble-id={id}
            aria-label={`귀족 ${reqCode} 맞이`}
            onClick={() => dispatch({ type: 'CHOOSE_NOBLE', nobleId: id })}
          >
            {reqCode} 맞이
          </button>
        )
      })}
    </div>
  )
}

export function TrayGame({ committed }: { committed: GameState }) {
  const aiThinking = useGameStore((s) => s.aiThinking)
  const selectCard = useGameStore((s) => s.selectCard)
  const selectDeck = useGameStore((s) => s.selectDeck)
  const lastError = useGameStore((s) => s.lastError)
  const dismissError = useGameStore((s) => s.dismissError)
  const { gemCodeLang, setGemLang, expand, toggleExpand } = useTraySettings()

  const me = viewerIndexFor(committed)
  const myTurn = committed.config.players[committed.currentPlayer]?.type === 'human'
  const myScore = committed.players[me]!.prestige
  const phase = committed.phase

  const togglePick = useGameStore((s) => s.togglePick)
  const dispatch = useGameStore((s) => s.dispatch)
  const undo = useGameStore((s) => s.undo)
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const undoable = useGameStore((s) => canUndo(s))

  // 게임 조작 단축키(이슈 ①) — Esc 는 TrayApp 소유이므로 여기선 무시. 화면 힌트는 노출 안 함.
  const phaseKind = committed.phase.kind
  const passOnly = (() => {
    const legal = legalActions(committed)
    return legal.length === 1 && legal[0]!.type === 'PASS'
  })()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return // TrayApp 소유
      const action = resolveShortcut(
        { key: e.key, hasModifier: e.ctrlKey || e.altKey || e.metaKey },
        {
          popoverOpen: false, // 이 리스너는 Esc 를 다루지 않으므로 미사용
          screen: 'game',
          phase: phaseKind,
          myTurn,
          passOnly,
          undoable,
          hasPending: pendingPicks.length > 0,
        },
      )
      switch (action.type) {
        case 'toggleExpand':
          e.preventDefault(); toggleExpand(action.panel); break
        case 'toggleLang':
          e.preventDefault(); setGemLang(gemCodeLang === 'ko' ? 'en' : 'ko'); break
        case 'undo':
          e.preventDefault(); undo(); break
        case 'confirm': {
          e.preventDefault()
          const a = buildPickAction(pendingPicks)
          if (a) dispatch(a)
          break
        }
        case 'pass':
          e.preventDefault(); dispatch({ type: 'PASS' }); break
        case 'pick':
          e.preventDefault(); togglePick(GEM_COLORS[action.index]!); break
        default:
          break // 'none' | 'hide' | 'closePopover' 무시
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    phaseKind, myTurn, passOnly, undoable, pendingPicks,
    gemCodeLang, toggleExpand, setGemLang, undo, dispatch, togglePick,
  ])

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

      {/* 행동 affordance — 페이즈별로 사람만 조작 (규칙 판정은 dispatch가 엔진에 위임) */}
      {myTurn && phase.kind === 'play' && (
        <PlayActions committed={committed} me={me} lang={gemCodeLang} />
      )}
      {myTurn && phase.kind === 'discard' && (
        <DiscardActions
          committed={committed}
          me={me}
          lang={gemCodeLang}
          mustDiscard={phase.mustDiscard}
        />
      )}
      {myTurn && phase.kind === 'chooseNoble' && (
        <NobleChoiceActions options={phase.options} lang={gemCodeLang} />
      )}

      {lastError && (
        <button type="button" className="tray-error" onClick={dismissError} aria-live="assertive">
          ⚠ {lastError}
        </button>
      )}

      {expand.board && (
        <BoardPanel
          committed={committed}
          lang={gemCodeLang}
          onSelectCard={selectCard}
          onSelectDeck={selectDeck}
        />
      )}
      {expand.opponents && <OpponentsPanel committed={committed} me={me} lang={gemCodeLang} />}
      {expand.nobles && <NoblesPanel committed={committed} lang={gemCodeLang} />}
    </main>
  )
}
