import type { GameResult, GameState } from '../../engine'

export function TrayResult({ committed, result }: { committed: GameState; result: GameResult }) {
  const winner = committed.config.players[result.winners[0]!]?.name ?? '?'
  return <div data-tray-screen="result">결과 · 승자 {winner}</div>
}
