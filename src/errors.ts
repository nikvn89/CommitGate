function getCode(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = (value as { code?: unknown }).code
  if (raw === undefined || raw === null || raw === '') return undefined
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getMessage(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (typeof value !== 'object') return String(value)

  const object = value as Record<string, unknown>
  if (typeof object.message === 'string') return object.message

  const nested = getMessage(object.data, depth + 1)
  if (nested) return nested

  const cause = getMessage(object.cause, depth + 1)
  if (cause) return cause

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function oneLine(message: string) {
  return message.replace(/\s+/g, ' ').trim().slice(0, 600)
}

export function normalizeError(raw: unknown): string {
  const code = getCode(raw)
  const message = oneLine(getMessage(raw))

  if (code === 4001) return 'Wallet request was rejected.'
  if (code === 4100) return 'Wallet account access is not authorized.'
  if (code === 4902) return 'GenLayer Studio Network is not configured in the wallet.'
  if (code === -32002) return 'A wallet request is already open. Check MetaMask.'
  if (code === -32601) return 'The wallet does not support that optional RPC method. Normal MetaMask writes can still work.'
  if (code === -32603) return message || 'Wallet or RPC returned an internal error.'

  if (/user rejected|user denied/i.test(message)) return 'Wallet request was rejected.'
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return 'Network/RPC request failed. The transaction may still be submitted if a hash was already returned.'
  }
  if (/429|rate limit|too many requests/i.test(message)) {
    return 'StudioNet rate limit reached. Wait before refreshing or submitting another transaction.'
  }

  return message || 'Unexpected wallet or RPC error.'
}

export function reportError(context: string, raw: unknown): string {
  console.error(`[CommitGate:${context}]`, raw)
  return `${context}: ${normalizeError(raw)}`
}

/**
 * Wraps a single network step so a failure names the exact operation that
 * failed. Previously every failure inside a multi-step handler was reported as
 * the handler's name (e.g. "submit commitment"), which hid whether the failing
 * call was a gen_call READ or the eth_sendTransaction WRITE.
 */
export class StepError extends Error {
  readonly step: string
  readonly cause: unknown

  constructor(step: string, cause: unknown) {
    super(`${step}: ${normalizeError(cause)}`)
    this.name = 'StepError'
    this.step = step
    this.cause = cause
  }
}

export async function step<T>(label: string, run: () => Promise<T> | T): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof StepError) throw error
    console.error(`[CommitGate:step:${label}]`, error)
    throw new StepError(label, error)
  }
}
