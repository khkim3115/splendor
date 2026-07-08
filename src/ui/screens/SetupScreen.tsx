import { useState } from 'react'
import type { GameConfig, PlayerKind } from '../../engine'
import { useGameStore } from '../../store/gameStore'
import { hasSave } from '../../store/persistence'

type SeatKind = 'human' | 'easy' | 'normal' | 'hard'

const SEAT_LABEL: Record<SeatKind, string> = {
  human: '사람',
  easy: 'AI · 쉬움',
  normal: 'AI · 보통',
  hard: 'AI · 어려움',
}

const defaultName = (kind: SeatKind, i: number): string =>
  kind === 'human' ? `플레이어 ${i + 1}` : `${SEAT_LABEL[kind]} ${i + 1}`

const DEFAULT_KINDS: SeatKind[] = ['human', 'normal', 'easy', 'normal']

export function SetupScreen() {
  const newGame = useGameStore((s) => s.newGame)
  const loadSaved = useGameStore((s) => s.loadSaved)
  const [count, setCount] = useState<2 | 3 | 4>(2)
  const [kinds, setKinds] = useState<SeatKind[]>(DEFAULT_KINDS)
  const [names, setNames] = useState<string[]>(
    DEFAULT_KINDS.map((k, i) => defaultName(k, i)),
  )
  const [seedText, setSeedText] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const setKind = (i: number, kind: SeatKind) => {
    setKinds(kinds.map((k, j) => (j === i ? kind : k)))
    // 이름을 손대지 않았다면 좌석 종류에 맞춰 갱신
    if (names[i] === defaultName(kinds[i]!, i) || names[i]?.trim() === '') {
      setNames(names.map((n, j) => (j === i ? defaultName(kind, i) : n)))
    }
  }

  const start = () => {
    const players: PlayerKind[] = Array.from({ length: count }, (_, i) => {
      const kind = kinds[i]!
      const name = names[i]?.trim() || defaultName(kind, i)
      return kind === 'human' ? { type: 'human', name } : { type: 'ai', name, difficulty: kind }
    })
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
      <p className="setup-sub">르네상스 보석 상인의 명성 경쟁 — 2~4인 · AI 대전 지원</p>

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
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
            />
            <select
              aria-label={`${i + 1}번 자리 종류`}
              value={kinds[i]}
              onChange={(e) => setKind(i, e.target.value as SeatKind)}
            >
              <option value="human">사람</option>
              <option value="easy">AI · 쉬움</option>
              <option value="normal">AI · 보통</option>
              <option value="hard">AI · 어려움</option>
            </select>
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
          <button type="button" className="btn btn-lg" onClick={() => setLoadError(loadSaved())}>
            저장된 게임 불러오기
          </button>
          {loadError && <p className="error-text">⚠ {loadError}</p>}
        </section>
      )}

      <p className="setup-download">
        🖥️ 데스크톱에 작게 띄워두고 싶다면{' '}
        <a
          href="https://github.com/khkim3115/splendor/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          트레이 앱 다운로드
        </a>
        <span className="setup-download-os"> · Windows · macOS</span>
      </p>
    </main>
  )
}
