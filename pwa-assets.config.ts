import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * Іконки застосунку з public/app-icon.svg (npm run icons): чорний фон, білий контурний вогник —
 * як мінімалістичні теми iPhone. Іконка вкладки браузера — окремо, public/favicon.svg (зелена).
 * Стандартний minimal-2023 клав іконку для iPhone на білий фон із відступами — тут на всю площу.
 */
const BACKGROUND = '#000000' // фон у app-icon.svg

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // favicon.ico не перегенеровуємо — вкладка браузера лишається з зеленою іконкою
    transparent: { ...minimal2023Preset.transparent, favicons: [] },
    // iPhone: без відступів, кути iOS заокруглює сама
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: BACKGROUND, fit: 'contain' } },
    // Android maskable: система обрізає під свою форму, тож відступ («безпечна зона») і той самий фон
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BACKGROUND, fit: 'contain' } },
  },
  images: ['public/app-icon.svg'],
})
