export interface DiffPart {
  type: 'same' | 'added' | 'removed'
  text: string
}

/** Words, runs of whitespace and single punctuation marks, so a fixed comma shows as just that. */
function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}\p{M}'’]+|\s+|[^\s\p{L}\p{N}\p{M}]/gu) ?? []
}

/** Above this many token pairs, skip the word diff and show the result as one change. */
const MAX_CELLS = 400_000

/**
 * Word-level diff of `before` → `after` (longest common subsequence), for showing
 * what the writing tools changed. Adjacent parts of the same type are merged.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length * b.length > MAX_CELLS) {
    const whole: DiffPart[] = [
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ]
    return whole.filter((p) => p.text)
  }

  // lcs[i][j] = length of the LCS of a[i:] and b[j:]
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts[parts.length - 1]
    if (last?.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('removed', a[i++])
    else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

/** True when the rewrite only differs in whitespace. */
export function isUnchanged(before: string, after: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  return norm(before) === norm(after)
}
