/**
 * Розпізнавання штрихкодів з камери.
 * Android (Chrome): вбудований BarcodeDetector. iPhone (Safari) його не має — тоді
 * barcode-detector на zxing-wasm. Обидва варіанти вантажаться лише при першому відкритті сканера;
 * WASM-файл (~1 МБ) іде з нашого сайту, а не з CDN, і кешується сервіс-воркером (робота офлайн).
 */

/**
 * Формати на продуктах: EAN-13/8 і UPC-A. UPC-E (стиснутий UPC, в Україні рідкість) не беремо:
 * його 8 цифр — не EAN-8, і без розгортання в UPC-A шукався б не той код.
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a']

export interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

interface NativeDetectorClass {
  new (opts: { formats: string[] }): Detector
  getSupportedFormats(): Promise<string[]>
}

let detector: Promise<Detector> | null = null

/** Один розпізнавач на сесію (WASM ініціалізується один раз). */
export function getBarcodeDetector(): Promise<Detector> {
  detector ??= createDetector().catch((err: unknown) => {
    detector = null // наступна спроба — заново
    throw err
  })
  return detector
}

async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
    } catch {
      // вбудований є, але не працює (буває на десктопі) — беремо WASM
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // за замовчуванням бібліотека бере WASM із jsDelivr — віддаємо свій
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  })
  return new BarcodeDetector({ formats: FORMATS as never })
}

/** Задня камера телефона; на ноутбуці — будь-яка. */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
}

/** Чи вміє камера ліхтарик (Android Chrome); на iPhone — ні. */
export function torchOf(stream: MediaStream): MediaStreamTrack | null {
  const track = stream.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
  return track && caps?.torch ? track : null
}

export function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  return track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
}
