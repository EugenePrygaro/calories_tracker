/**
 * Легкий тактильний відгук (Android; iOS Safari вібрацію не підтримує — тихо ігнорується).
 * Лише після першої взаємодії зі сторінкою — інакше браузер блокує виклик і пише в консоль.
 */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === 'undefined' || !navigator.userActivation?.hasBeenActive) return
  navigator.vibrate?.(pattern)
}
