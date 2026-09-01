/**
 * Formats an FSRS interval (`@/learning/srs/fsrs-adapter.ts#previewIntervals`'s ms values) as
 * a short human string for a self-assess rating button — `spec/tasks/12-vocabulary-exercises.md`
 * §5: "Кнопки должны показывать предполагаемые интервалы ... это даёт пользователю обратную
 * связь о работе алгоритма." Pure formatting, no FSRS knowledge — the adapter already did the
 * math, this just picks a readable unit.
 */
export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / (60 * 1000))
  if (minutes < 60) return `${Math.max(minutes, 1)} мин`

  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours < 24) return `${hours} ч`

  const days = Math.round(ms / (24 * 60 * 60 * 1000))
  return `${days} дн`
}
