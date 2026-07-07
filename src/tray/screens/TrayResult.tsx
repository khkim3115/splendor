import type { GameResult, GameState } from '../../engine'
import { useGameStore } from '../../store/gameStore'

/** 무채색 결과 — 승자·순위·동점 근거 (스펙 §8/§9-E) */
export function TrayResult({ committed, result }: { committed: GameState; result: GameResult }) {
  const abandonGame = useGameStore((s) => s.abandonGame)
  const name = (i: number) => committed.config.players[i]?.name ?? `P${i + 1}`

  // 명성 내림차순, 동점 시 구매 카드 적은 쪽 우선 (§8 타이브레이크)
  const ranked = result.scores
    .map((s, i) => ({ ...s, i, winner: result.winners.includes(i) }))
    .sort((a, b) => b.prestige - a.prestige || a.purchasedCount - b.purchasedCount)

  return (
    <main className="tray-result" data-tray-screen="result">
      <h1 className="tray-result-title">게임 종료</h1>
      {result.reason === 'deadlockExhausted' && (
        <p className="tray-result-note">교착 종료 (§9-E)</p>
      )}
      <p className="tray-result-winner">
        {result.winners.length > 1
          ? `공동 승리: ${result.winners.map(name).join(', ')}`
          : `승자: ${name(result.winners[0] ?? 0)}`}
      </p>

      <ol className="tray-result-list">
        {ranked.map((r) => (
          <li className={`tray-result-row ${r.winner ? 'is-winner' : ''}`} key={r.i} data-rank-index={r.i}>
            <span className="tray-result-name">{name(r.i)}</span>
            <span className="tray-result-score">
              {r.prestige}점 · 카드{r.purchasedCount} · 귀족{committed.players[r.i]?.nobles.length ?? 0}
            </span>
          </li>
        ))}
      </ol>

      <button type="button" className="tray-btn tray-btn-primary" onClick={abandonGame}>
        새 게임
      </button>
    </main>
  )
}
