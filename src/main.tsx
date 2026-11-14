import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Шрифт застосунку — локально (працює офлайн), лише кирилиця й латиниця
import '@fontsource/play/cyrillic-400.css'
import '@fontsource/play/latin-400.css'
import '@fontsource/play/cyrillic-700.css'
import '@fontsource/play/latin-700.css'
import './index.css'
import App from './App.tsx'
import { startAutoRefresh } from './data/store'

registerSW({ immediate: true })
startAutoRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
