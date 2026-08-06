// --- Public Types ---

export interface FetchRateResult {
  ok: true
  rate: number // units of target per 1 unit of base
  date: string // actual date returned by Frankfurter (may differ on weekends)
}

export interface FetchRateError {
  ok: false
  reason: 'network' | 'not_found' | 'invalid_response'
  message: string
}

export type FetchRateOutcome = FetchRateResult | FetchRateError

// --- Constants ---

const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'ISK', 'HUF'] as const

// --- Public Functions ---

/**
 * Fetch the exchange rate for a given date from Frankfurter API.
 * Returns a discriminated union so callers handle failures explicitly.
 */
export async function fetchRate(
  base: string,
  target: string,
  date: string, // YYYY-MM-DD
): Promise<FetchRateOutcome> {
  const url = `https://api.frankfurter.dev/v1/${date}?base=${base}&symbols=${target}`

  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Network request failed'
    return { ok: false, reason: 'network', message }
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: 'not_found',
      message: `Frankfurter API returned ${response.status}`,
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return {
      ok: false,
      reason: 'invalid_response',
      message: 'Failed to parse JSON response',
    }
  }

  const parsed = body as { rates?: Record<string, number>; date?: string }
  const rate = parsed?.rates?.[target]

  if (typeof rate !== 'number') {
    return {
      ok: false,
      reason: 'invalid_response',
      message: `Rate for ${target} not found in response`,
    }
  }

  return {
    ok: true,
    rate,
    date: typeof parsed.date === 'string' ? parsed.date : date,
  }
}

/**
 * Lookup ISO 4217 decimal digits for a currency code.
 * Returns 0 for zero-decimal currencies (JPY, KRW, ISK, HUF), 2 for all others.
 */
export function getDecimalDigits(currencyCode: string): number {
  return (ZERO_DECIMAL_CURRENCIES as readonly string[]).includes(
    currencyCode.toUpperCase(),
  )
    ? 0
    : 2
}

/**
 * Convert an amount from one currency to another using a given rate.
 * All values are in minor units (cents).
 *
 * Formula: Math.round((originalAmountMinorUnits / 10^sourceDecimalDigits) * rate * 10^targetDecimalDigits)
 *
 * @param originalAmountMinorUnits - integer cents in the source currency
 * @param rate - units of target per 1 unit of source (e.g. 0.92)
 * @param sourceDecimalDigits - ISO 4217 decimal digits of source currency
 * @param targetDecimalDigits - ISO 4217 decimal digits of target currency
 * @returns integer minor units in the target currency
 */
export function convertAmount(
  originalAmountMinorUnits: number,
  rate: number,
  sourceDecimalDigits: number,
  targetDecimalDigits: number,
): number {
  const majorUnits =
    originalAmountMinorUnits / Math.pow(10, sourceDecimalDigits)
  const convertedMajor = majorUnits * rate
  const convertedMinor = convertedMajor * Math.pow(10, targetDecimalDigits)
  return Math.round(convertedMinor)
}
