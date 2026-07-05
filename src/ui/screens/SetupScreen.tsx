import { useState } from 'react'
import type { GameConfig, PlayerKind } from '../../engine'
import { useGameStore } from '../../store/gameStore'
import { hasSave } from '../../store/persistence'

const DEFAULT_NAMES = ['플레이어 1', '플레이어 2', '플레이어 3', '플레이어 4']

export function SetupScreen() {
  const newGame = useGameStore((s) => s.newGame)
  const loadSaved = useGameStore((s) => s.loadSaved)
  const [count, setCount] = useState<2 | 3 | 4>(2)
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES)
  const [seedText, setSeedText] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const start = () => {
    const players: PlayerKind[] = Array.from({ length: count }, (_, i) => ({
      type: 'human',
      name: names[i]?.trim() || DEFAULT_NAMES[i]!,
    }))
    const seed =
      seedText.trim() !== '' && Number.isInteger(Number(seedText))
        ? Number(seedText)
        : crypto.getRandomValues(new Uint32Array(1))[0]!
    const config: GameConfig = { players, seed }
    newGame(config)
  }

  return (
    <main className="setup-screen">
      <h1>스플랜더</h1>
      <p className="setup-sub">르네상스 보석 상인의 명성 경쟁 — 2~4인</p>

      <section className="setup-card">
        <h2>새 게임</h2>
        <div className="setup-row">
          <label htmlFor="player-count">인원</label>
          <div className="count-buttons" id="player-count">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`btn ${count === n ? 'btn-primary' : ''}`}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n}인
              </button>
            ))}
          </div>
        </div>

        {Array.from({ length: count }, (_, i) => (
          <div className="setup-row" key={i}>
            <label htmlFor={`name-${i}`}>{i + 1}번 자리</label>
            <input
              id={`name-${i}`}
              value={names[i] ?? ''}
              maxLength={12}
              onChange={(e) =>
                setNames(names.map((n, j) => (j === i ? e.target.value : n)))
              }
            />
            <span className="seat-kind">사람 (AI는 M5에서 추가됩니다)</span>
          </div>
        ))}

        <div className="setup-row">
          <label htmlFor="seed">시드 (선택)</label>
          <input
            id="seed"
            value={seedText}
            placeholder="비워두면 무작위"
            inputMode="numeric"
            onChange={(e) => setSeedText(e.target.value)}
          />
        </div>

        <button type="button" className="btn btn-primary btn-lg" onClick={start}>
          게임 시작
        </button>
      </section>

      {hasSave() && (
        <section className="setup-card">
          <h2>이어하기</h2>
          <button
            type="button"
            className="btn btn-lg"
            onClick={() => setLoadError(loadSaved())}
          >
            저장된 게임 불러오기
          </button>
          {loadError && <p className="error-text">⚠ {loadError}</p>}
        </section>
      )}
    </main>
  )
}
