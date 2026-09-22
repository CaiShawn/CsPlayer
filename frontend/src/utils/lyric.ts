/** Find active lyric index for a playback time (seconds). */
export function findLyricIndex(
  lrc: { timeMs: number }[],
  timeMs: number,
): number {
  if (!lrc.length) return -1
  let lo = 0
  let hi = lrc.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lrc[mid].timeMs <= timeMs) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
