import { useGameStore } from './store/gameStore'
import { GameScreen } from './ui/screens/GameScreen'
import { ResultScreen } from './ui/screens/ResultScreen'
import { SetupScreen } from './ui/screens/SetupScreen'
import './ui/styles.css'

export default function App() {
  const committed = useGameStore((s) => s.committed)

  if (!committed) return <SetupScreen />
  if (committed.phase.kind === 'gameOver') {
    return <ResultScreen committed={committed} result={committed.phase.result} />
  }
  return <GameScreen committed={committed} />
}
