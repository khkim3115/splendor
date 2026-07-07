import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TrayApp } from './TrayApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrayApp />
  </StrictMode>,
)
