// 한국어 문자열 집중 (docs/ARCHITECTURE.md §1)
// 이벤트 → 한국어 서술 변환은 이 단일 함수로만 — 로그·낭독이 같은 문장을 쓴다.

import {
  CARDS,
  GEM_COLORS,
  NOBLES,
  TOKEN_COLORS,
  type GameEvent,
  type GameState,
  type TokenMap,
} from '../../engine'

export const COLOR_KO: Record<string, string> = {
  white: '다이아몬드',
  blue: '사파이어',
  green: '에메랄드',
  red: '루비',
  black: '오닉스',
  gold: '황금',
}

export function tokensKo(tokens: TokenMap): string {
  const parts: string[] = []
  for (const c of TOKEN_COLORS) {
    if (tokens[c] > 0) parts.push(`${COLOR_KO[c]} ${tokens[c]}개`)
  }
  return parts.length > 0 ? parts.join(', ') : '없음'
}

export function cardKo(cardId: number): string {
  const card = CARDS[cardId]
  if (!card) return '비공개 카드'
  const pts = card.points > 0 ? `${card.points}점 ` : ''
  return `${card.tier}티어 ${pts}${COLOR_KO[card.bonus]} 카드`
}

export function nobleKo(nobleId: number): string {
  const noble = NOBLES[nobleId]
  if (!noble) return '귀족'
  const req = GEM_COLORS.filter((g) => noble.requirement[g] > 0)
    .map((g) => `${COLOR_KO[g]} ${noble.requirement[g]}`)
    .join('·')
  return `귀족 (${req})`
}

/** 이벤트 스트림 → 자연스러운 한국어 한 문장 (게임 로그·aria-live 낭독 공용) */
export function describeEvent(event: GameEvent, state: GameState): string {
  const name = (i: number): string => state.config.players[i]?.name ?? `플레이어 ${i + 1}`

  switch (event.t) {
    case 'tokensTaken':
      return `${name(event.player)}: ${tokensKo(event.tokens)} 획득`
    case 'tokensReturned':
      return `${name(event.player)}: ${tokensKo(event.tokens)} 반납`
    case 'cardReserved': {
      const what =
        event.from.slot === 'deck'
          ? `${event.from.tier}티어 덱에서 비공개 카드`
          : cardKo(event.card.cardId)
      const gold = event.goldGained ? ' (+황금 1개)' : ' (황금 없음)'
      return `${name(event.player)}: ${what} 예약${gold}`
    }
    case 'cardPurchased': {
      const from = event.from === 'reserve' ? '예약해 둔 ' : ''
      return `${name(event.player)}: ${from}${cardKo(event.cardId)} 구매 (지불: ${tokensKo(event.payment)})`
    }
    case 'slotRefilled':
      return event.cardId === null
        ? `${event.tier}티어 덱 소진 — 빈자리가 남습니다`
        : `${cardKo(event.cardId)} 공개`
    case 'nobleVisited':
      return `${name(event.player)}: ${nobleKo(event.nobleId)} 방문! +3점${event.auto ? '' : ' (선택)'}`
    case 'discardRequired':
      return `${name(event.player)}: 토큰 10개 초과 — ${event.mustDiscard}개를 반납해야 합니다`
    case 'finalRoundTriggered':
      return `${name(event.byPlayer)}: 15점 이상 달성! 마지막 라운드입니다`
    case 'turnEnded':
      return `${name(event.nextPlayer)}님의 차례`
    case 'gameEnded': {
      const winners = event.result.winners.map(name).join(', ')
      return event.result.winners.length > 1 ? `공동 승리: ${winners}!` : `${winners} 승리!`
    }
  }
}
