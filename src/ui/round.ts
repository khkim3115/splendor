import type { GameState } from '../engine'

/**
 * 1-based 라운드 번호. turn 0은 항상 선 플레이어의 첫 수이고(setup),
 * 매 수(PASS 포함)마다 turn이 1 증가하므로(apply.finishTurn),
 * n=플레이어 수일 때 floor(turn/n)+1이 선 플레이어 기준 라운드를 준다.
 * startPlayer 인덱스와 무관하게 성립한다.
 */
export function roundNumber(view: Pick<GameState, 'turn' | 'config'>): number {
  return Math.floor(view.turn / view.config.players.length) + 1
}
