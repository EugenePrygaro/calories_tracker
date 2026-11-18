import { motion } from "framer-motion";
import {
  Flashlight,
  FlashlightOff,
  LoaderCircle,
  ScanBarcode,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { canonicalEan, type FoodItem } from "@shared/model.js";
import { Button } from "@/components/ui/Button";
import { NumberField } from "@/components/ui/Field";
import { api } from "@/data/api";
import { useDataStore } from "@/data/store";
import { haptic } from "@/lib/haptics";
import {
  getBarcodeDetector,
  openCamera,
  setTorch,
  torchOf,
} from "@/lib/scanner";
import { findFoodByEan, withPackagePortion } from "./portionMath";

/** Як часто питати розпізнавач (кадрів не треба більше — він і так не встигає). */
const SCAN_EVERY_MS = 180;
/** Той самий код стільки кадрів поспіль — тоді віримо (захист від хибного прочитання). */
const CONFIRM_READS = 2;
/** Кутики прицілу: по дві сторони рамки, із заокругленням як у самої рамки. */
const SIGHT_CORNERS = [
  "top-0 left-0 rounded-tl-2xl border-t-[3px] border-l-[3px]",
  "top-0 right-0 rounded-tr-2xl border-t-[3px] border-r-[3px]",
  "bottom-0 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]",
  "bottom-0 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]",
] as const;

type Phase =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "looking"; ean: string }
  | { kind: "error"; message: string };

/**
 * Сканер штрихкоду: камера → код → «Мої страви» (миттєво, офлайн) → Сільпо, Zakaz.ua, OFF.
 * Знайшли — onFound (далі крок ваги), ніде немає — onNotFound(ean) (ручне введення, код запам'ятається).
 */
export function ScanStep({
  onFound,
  onNotFound,
}: {
  onFound: (item: FoodItem) => void;
  onNotFound: (ean: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [torch, setTorchTrack] = useState<MediaStreamTrack | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [typed, setTyped] = useState("");
  /** Зупинити камеру (ставить ефект камери): код уже є — більше не скануємо. */
  const stopCamera = useRef<() => void>(() => {});
  /** Пошук за кодом іде — другий (з камери чи з поля) не запускаємо. */
  const busy = useRef(false);
  /** Пішли з кроку, поки йшов пошук, — відповідь уже нікуди не веде. */
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const lookup = (ean: string) => {
    if (busy.current) return;
    busy.current = true;
    stopCamera.current();
    haptic([12, 40, 12]);
    setPhase({ kind: "looking", ean });
    const mine = findFoodByEan(useDataStore.getState().foods, ean);
    if (mine) return onFound(mine);
    const ctrl = new AbortController();
    pending.current = ctrl;
    api
      .searchEan(ean, ctrl.signal)
      .then(({ results }) => {
        if (ctrl.signal.aborted) return;
        const item = results[0];
        if (item) onFound(withPackagePortion(item));
        else onNotFound(ean);
      })
      // без мережі чи джерела впали — вводимо вручну, код запам'ятається зі стравою
      .catch(() => {
        if (!ctrl.signal.aborted) onNotFound(ean);
      });
  };
  // ефект камери живе весь час кроку; код передаємо найсвіжішому обробнику без перезапуску камери
  const onCode = useEffectEvent((ean: string) => lookup(ean));

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let last = "";
    let reads = 0;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    stopCamera.current = stop;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no_camera");
        // потік запам'ятовуємо, щойно камера відкрилась: навіть якщо розпізнавач не завантажиться
        // (iPhone офлайн, WASM ще не в кеші), stop() її вимкне
        const camera = openCamera().then((s) => {
          stream = s;
          if (stopped) stop();
          return s;
        });
        const [s, detector] = await Promise.all([camera, getBarcodeDetector()]);
        if (stopped) return stop();
        const el = video.current;
        if (!el) return stop();
        el.srcObject = s;
        await el.play();
        setTorchTrack(torchOf(s));
        setPhase({ kind: "scanning" });

        const tick = async () => {
          if (stopped) return;
          if (el.readyState >= 2) {
            try {
              const codes = await detector.detect(el);
              const ean = codes
                .map((c) => canonicalEan(c.rawValue))
                .find((c): c is string => !!c);
              if (ean) {
                reads = ean === last ? reads + 1 : 1;
                last = ean;
                if (reads >= CONFIRM_READS) {
                  stop();
                  onCode(ean);
                  return;
                }
              }
            } catch {
              // кадр не вдалося розібрати — пробуємо наступний
            }
          }
          timer = window.setTimeout(() => void tick(), SCAN_EVERY_MS);
        };
        void tick();
      } catch (err) {
        stop();
        const name = err instanceof Error ? err.name : "";
        setPhase({
          kind: "error",
          message:
            name === "NotAllowedError"
              ? "Немає доступу до камери — дозвольте його в налаштуваннях браузера або введіть код вручну"
              : name === "NotFoundError" ||
                  (err instanceof Error && err.message === "no_camera")
                ? "Камери не знайдено — введіть код вручну"
                : "Не вдалося запустити сканер — введіть код вручну",
        });
      }
    })();

    return stop;
  }, []);

  const toggleTorch = () => {
    if (!torch) return;
    const next = !torchOn;
    setTorchOn(next);
    void setTorch(torch, next).catch(() => setTorchOn(!next));
  };

  const typedEan = canonicalEan(typed.replace(/\s+/g, ""));
  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    if (typedEan) lookup(typedEan);
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative aspect-[3/4] max-h-[55dvh] w-full overflow-hidden rounded-3xl bg-black">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="size-full object-cover"
        />

        {/* Приціл: лише кутики, майже квадратний; решта кадру притемнена.
            Він тільки підказує, куди наводити, — розпізнавач аналізує весь кадр. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="relative aspect-[6/5] w-[72%] rounded-2xl"
            style={{ boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.38)" }}
          >
            {SIGHT_CORNERS.map((corner) => (
              <span key={corner} className={`absolute size-8 border-white/90 ${corner}`} />
            ))}
            {phase.kind === "scanning" && (
              <motion.span
                className="absolute inset-x-3 h-0.5 rounded-full bg-primary shadow-[0_0_12px_var(--accent-primary)]"
                initial={{ top: "12%" }}
                animate={{ top: ["12%", "88%", "12%"] }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
          </div>
        </div>

        {phase.kind !== "scanning" && phase.kind !== "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm text-white">
            <LoaderCircle className="size-7 animate-spin" />
            {phase.kind === "looking"
              ? `Шукаємо ${phase.ean}…`
              : "Вмикаємо камеру…"}
          </div>
        )}

        {torch && phase.kind === "scanning" && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-label={torchOn ? "Вимкнути ліхтарик" : "Увімкнути ліхтарик"}
            className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-black/55 text-white"
          >
            {torchOn ? (
              <FlashlightOff className="size-5" />
            ) : (
              <Flashlight className="size-5" />
            )}
          </button>
        )}
      </div>

      <p className="flex items-start gap-2 text-sm text-muted">
        <ScanBarcode className="mt-0.5 size-4 shrink-0 text-primary" />
        {phase.kind === "error"
          ? phase.message
          : "Наведіть камеру на штрихкод упаковки. Спершу шукаємо в «Моїх стравах», потім у супермаркетах"}
      </p>

      <form onSubmit={submitTyped} className="flex items-end gap-2">
        <NumberField
          label="Або введіть код"
          value={typed}
          onChange={setTyped}
          inputMode="numeric"
          placeholder="4820…"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="ghost"
          disabled={!typedEan || phase.kind === "looking"}
          className="shrink-0"
        >
          Знайти
        </Button>
      </form>
    </div>
  );
}
