/** Duration formatting shared by the score screen. Mirrors the original `timestr`. */
export function formatTime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const secs = seconds % 60;
  if (days > 0) return `${days}d+${String(hours).padStart(2, '0')}hrs`;
  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
