import { useEffect, useRef } from 'react'
import type { GameEvent, GameState } from '../../../engine'
import { describeEvent } from '../../i18n/ko'

/** 게임 로그 — eventFeed를 describeEvent로 서술 (docs/ARCHITECTURE.md §2.2) */
export function GameLog({ feed, state }: { feed: readonly GameEvent[]; state: GameState }) {
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // 컨테이너 한정 스크롤 — scrollIntoView는 페이지 전체를 끌고 간다
    const box = boxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [feed.length])

  return (
    <div className="game-log" aria-label="게임 로그" ref={boxRef}>
      <ol>
        {feed.map((e, i) => (
          <li key={i}>{describeEvent(e, state)}</li>
        ))}
      </ol>
    </div>
  )
}
