import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { aiClient } from './ai/client'
import { useGameStore } from './store/gameStore'

if (import.meta.env.DEV) {
  // dev 전용 디버그 훅 — Worker 강제 종료(폴백 검증)·상태 관찰용
  Object.assign(window, { __splendor: { aiClient, store: useGameStore } })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
