import type { GameState } from '../../engine'

export function TrayGame({ committed }: { committed: GameState }) {
  return <div data-tray-screen="game">게임 (턴 {committed.turn})</div>
}
