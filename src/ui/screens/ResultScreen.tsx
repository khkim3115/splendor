import type { GameResult, GameState } from '../../engine'
import { useGameStore } from '../../store/gameStore'

/** 결과 화면 — 순위·동점 판정 근거·공동 승리 표기 (§8) */
export function ResultScreen({ committed, result }: { committed: GameState; result: GameResult }) {
  const abandonGame = useGameStore((s) => s.abandonGame)
  const name = (i: number) => committed.config.players[i]?.name ?? `플레이어 ${i + 1}`

  const ranked = result.scores
    .map((s, i) => ({ ...s, i, winner: result.winners.includes(i) }))
    .sort((a, b) => b.prestige - a.prestige || a.purchasedCount - b.purchasedCount)

  const maxPrestige = Math.max(...result.scores.map((s) => s.prestige))
  const topCount = result.scores.filter((s) => s.prestige === maxPrestige).length
  const tieBroken = topCount > 1 && result.winners.length < topCount

  return (
    <main className="result-screen">
      <h1>게임 종료</h1>
      {result.reason === 'deadlockExhausted' && (
        <p className="result-note">전원 진행 불능(교착)으로 현재 점수로 종료되었습니다 (§9-E)</p>
      )}
      <h2 className="result-winner">
        {result.winners.length > 1
          ? `공동 승리: ${result.winners.map(name).join(', ')}`
          : `승자: ${name(result.winners[0]!)}`}
        {' 🏆'}
      </h2>
      {tieBroken && (
        <p className="result-note">동점 — 구매한 개발 카드 수가 더 적어 승리했습니다 (§8-4)</p>
      )}

      <table className="result-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>이름</th>
            <th>명성점</th>
            <th>구매 카드</th>
            <th>귀족</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, rank) => (
            <tr key={r.i} className={r.winner ? 'winner-row' : ''}>
              <td>{rank + 1}</td>
              <td>
                {name(r.i)}
                {r.winner ? ' 🏆' : ''}
              </td>
              <td>{r.prestige}점</td>
              <td>{r.purchasedCount}장</td>
              <td>{committed.players[r.i]!.nobles.length}장</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="btn btn-primary btn-lg" onClick={abandonGame}>
        새 게임
      </button>
    </main>
  )
}
