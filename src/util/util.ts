import { DEBOUNCE_DEFAULT_WAIT } from '../constants'

/**
 * Copy plain text to system clipboard
 * Includes fallback solution for Chrome content script permission limitations
 * @param text Target text to copy
 * @returns True if copy succeeded, false on all failure paths
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  // Skip empty input directly
  if (!text) return false

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (clipErr) {
    // Fallback: hidden textarea copy for restricted environments
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return true
    } catch (fallbackErr) {
      console.error('Clipboard copy all failed:', clipErr, fallbackErr)
      return false
    }
  }
}

/**
 * Generic debounce utility to throttle frequent function calls
 * Delays execution until after specified quiet period has passed
 * @param fn Original callback function to wrap
 * @param wait Millisecond delay threshold before execution
 * @returns Wrapped debounced function with identical argument types
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait = DEBOUNCE_DEFAULT_WAIT): (...args: Args) => void {
  let timerId: ReturnType<typeof setTimeout> | null = null

  return (...args: Args) => {
    // Clear pending timeout on each new trigger
    if (timerId !== null) clearTimeout(timerId)
    timerId = setTimeout(() => fn(...args), wait)
  }
}
