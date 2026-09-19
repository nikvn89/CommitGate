// Exactly the code points for which Python's str.isspace() is True.
// Python strip() and JS trim() differ on six: Python also strips U+001C..U+001F
// and U+0085; JS also strips U+FEFF. The contract runs Python strip() and
// Python len(), so the frontend must match Python, not JS.
const PY_SPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d,
  0x001c, 0x001d, 0x001e, 0x001f,
  0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
])

/** Matches Python str.strip() with no arguments. */
export function pyStrip(value: string): string {
  const chars = Array.from(value)
  let start = 0
  let end = chars.length
  while (start < end && PY_SPACE.has(chars[start]!.codePointAt(0)!)) start += 1
  while (end > start && PY_SPACE.has(chars[end - 1]!.codePointAt(0)!)) end -= 1
  return chars.slice(start, end).join('')
}

/** Matches Python len(): counts code points, not UTF-16 units. */
export function pyLen(value: string): number {
  return Array.from(value).length
}
