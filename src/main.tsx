import { MotionConfig } from 'framer-motion'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Шрифт застосунку — локально (працює офлайн), лише кирилиця й латиниця
import '@fontsource/play/cyrillic-400.css'
import '@fontsource/play/latin-400.css'
import '@fontsource/play/cyrillic-700.css'
import '@fontsource/play/latin-700.css'
// Шрифт стилю Synthwave (themes.css); браузер завантажить його, лише коли стиль увімкнено
import '@fontsource/exo-2/cyrillic-400.css'
import '@fontsource/exo-2/latin-400.css'
import '@fontsource/exo-2/cyrillic-700.css'
import '@fontsource/exo-2/latin-700.css'
import './index.css'
import App from './App.tsx'
import { startAutoRefresh } from './data/store'
import { prefetchSheets } from './features/lazySheets'
import { resyncPush } from './lib/push'
import { applyTheme, readCachedTheme } from './lib/theme'

// Тема — до першого рендеру, щоб не блимала стандартна
applyTheme(readCachedTheme())

// Нова версія застосунку: оновлюємось, коли вкладку сховали, — не перериваємо введення
let updateReady = false
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true
  },
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && updateReady) void updateSW(true)
})
startAutoRefresh()
void resyncPush() // раз на добу освіжає підписку на сповіщення (якщо ввімкнені)

prefetchSheets()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
