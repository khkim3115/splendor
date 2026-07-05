import { useMemo, useState } from 'react'
import { playerView, type CardId, type GameState } from '../../engine'
import { useGameStore } from '../../store/gameStore'
import { CardBoard } from '../components/board/CardBoard'
import { NobleRow } from '../components/board/NobleRow'
import { TokenSupply } from '../components/board/TokenSupply'
import { ActionBar } from '../components/common/ActionBar'
import { Announcer } from '../components/common/Announcer'
import { GameLog } from '../components/common/GameLog'
import { TurnBanner } from '../components/common/TurnBanner'
import { DiscardModal } from '../components/modals/DiscardModal'
import { HandoffOverlay } from '../components/modals/HandoffOverlay'
import { NobleChoiceModal } from '../components/modals/NobleChoiceModal'
import { PaymentModal } from '../components/modals/PaymentModal'
import { PlayerPanel } from '../components/player/PlayerPanel'

/**
 * 게임 화면 — 항상 현재 차례 플레이어의 playerView로 렌더한다.
 * 핫시트에서 타인의 비공개 예약 정보가 DOM에 존재하지 않는 것이 이 한 줄로 보장된다 (§9-O)
 */
export function GameScreen({ committed }: { committed: GameState }) {
  const eventFeed = useGameStore((s) => s.eventFeed)
  const lastEvents = useGameStore((s) => s.lastEvents)
  const handoffPending = useGameStore((s) => s.handoffPending)
  const [paymentCard, setPaymentCard] = useState<CardId | null>(null)

  const view = useMemo(
    () => playerView(committed, committed.currentPlayer),
    [committed],
  )

  return (
    <main className="game-screen">
      <TurnBanner view={view} />
      <div className="game-layout">
        <section className="board-area">
          <NobleRow view={view} />
          <CardBoard view={view} />
          <TokenSupply view={view} />
        </section>
        <aside className="side-area">
          {view.players.map((_, i) => (
            <PlayerPanel key={i} view={view} index={i} />
          ))}
          <GameLog feed={eventFeed} state={view} />
        </aside>
      </div>
      <ActionBar view={view} onAdjustPayment={setPaymentCard} />
      <Announcer lastEvents={lastEvents} state={view} />

      {view.phase.kind === 'discard' && <DiscardModal view={view} />}
      {view.phase.kind === 'chooseNoble' && <NobleChoiceModal view={view} />}
      {paymentCard !== null && (
        <PaymentModal view={view} cardId={paymentCard} onClose={() => setPaymentCard(null)} />
      )}
      {handoffPending && <HandoffOverlay view={view} />}
    </main>
  )
}
