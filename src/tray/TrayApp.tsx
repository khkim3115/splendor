import { useGameStore } from '../store/gameStore'
import { TrayGame } from './screens/TrayGame'
import { TrayResult } from './screens/TrayResult'
import { TraySetup } from './screens/TraySetup'
import './tray.css'

export function TrayApp() {
  const committed = useGameStore((s) => s.committed)

  if (!committed) return <TraySetup />
  if (committed.phase.kind === 'gameOver') {
    return <TrayResult committed={committed} result={committed.phase.result} />
  }
  return <TrayGame committed={committed} />
}
