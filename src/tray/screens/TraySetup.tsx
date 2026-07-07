import { useState } from 'react'
import type { Difficulty, GameConfig, PlayerKind } from '../../engine'
import { useGameStore } from '../../store/gameStore'
import { hasSave } from '../../store/persistence'

type Count = 2 | 3 | 4
const COUNTS: readonly Count[] = [2, 3, 4]
const DIFFS: readonly { key: Difficulty; label: string }[] = [
  { key: 'easy', label: '쉬움' },
  { key: 'normal', label: '보통' },
  { key: 'hard', label: '어려움' },
]

/** 트레이는 항상 사람 1명 + AI n-1명 (스펙 §게임 범위). 좌석 어휘·시드 생성은 SetupScreen과 동일. */
function buildConfig(count: Count, difficulty: Difficulty): GameConfig {
  const players: PlayerKind[] = Array.from({ length: count }, (_, i): PlayerKind =>
    i === 0
      ? { type: 'human', name: '나' }
      : { type: 'ai', name: `AI ${i}`, difficulty },
  )
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
  return { players, seed }
}

export function TraySetup() {
  const newGame = useGameStore((s) => s.newGame)
  const loadSaved = useGameStore((s) => s.loadSaved)
  const [count, setCount] = useState<Count>(2)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [loadError, setLoadError] = useState<string | null>(null)

  return (
    <main className="tray-setup" data-tray-screen="setup">
      <div className="tray-seg" role="group" aria-label="인원">
        {COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`tray-seg-btn ${count === n ? 'is-active' : ''}`}
            aria-pressed={count === n}
            onClick={() => setCount(n)}
          >
            {n}인
          </button>
        ))}
      </div>

      <div className="tray-seg" role="group" aria-label="난이도">
        {DIFFS.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`tray-seg-btn ${difficulty === d.key ? 'is-active' : ''}`}
            aria-pressed={difficulty === d.key}
            onClick={() => setDifficulty(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="tray-btn tray-btn-primary"
        onClick={() => newGame(buildConfig(count, difficulty))}
      >
        시작
      </button>

      {hasSave() && (
        <button type="button" className="tray-btn" onClick={() => setLoadError(loadSaved())}>
          이어하기
        </button>
      )}
      {loadError && <p className="tray-error">⚠ {loadError}</p>}
    </main>
  )
}
