import { trpc } from '@/trpc/client'
import dayjs from 'dayjs'
import { useMediaQuery as useMediaQueryFoxact } from 'foxact/use-media-query'
import { useEffect, useState } from 'react'
import useSWR, { Fetcher } from 'swr'

/**
 * Safe useMediaQuery hook that handles SSR by providing a default server value
 * Uses foxact's SSR-safe implementation
 */
export function useMediaQuery(query: string): boolean {
  // Provide false as the server value to ensure SSR/client consistency
  return useMediaQueryFoxact(query, false)
}

/** True while the main scroll container is near the top (scroll-sentinel visible). */
export function useScrollAtTop(enabled = true) {
  const [isAtTop, setIsAtTop] = useState(true)

  useEffect(() => {
    if (!enabled) return

    const sentinel = document.getElementById('scroll-sentinel')
    const scrollRoot = sentinel?.parentElement
    if (!sentinel || !scrollRoot) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtTop(entry.isIntersecting)
      },
      { root: scrollRoot, threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [enabled])

  return isAtTop
}

/** Locks horizontal pan and pinch-zoom while a full-screen mobile form is open. */
export function useLockViewportWhileOpen(open: boolean) {
  useEffect(() => {
    if (!open) return

    const html = document.documentElement
    const body = document.body
    const viewportMeta = document.querySelector('meta[name="viewport"]')

    const previousViewport = viewportMeta?.getAttribute('content') ?? ''
    const previousHtmlOverflowX = html.style.overflowX
    const previousBodyOverflowX = body.style.overflowX
    const previousHtmlTouchAction = html.style.touchAction
    const previousBodyTouchAction = body.style.touchAction
    const previousHtmlOverscrollX = html.style.overscrollBehaviorX
    const previousBodyOverscrollX = body.style.overscrollBehaviorX

    viewportMeta?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
    )
    html.style.overflowX = 'hidden'
    body.style.overflowX = 'hidden'
    html.style.touchAction = 'pan-y'
    body.style.touchAction = 'pan-y'
    html.style.overscrollBehaviorX = 'none'
    body.style.overscrollBehaviorX = 'none'

    return () => {
      if (previousViewport) {
        viewportMeta?.setAttribute('content', previousViewport)
      }
      html.style.overflowX = previousHtmlOverflowX
      body.style.overflowX = previousBodyOverflowX
      html.style.touchAction = previousHtmlTouchAction
      body.style.touchAction = previousBodyTouchAction
      html.style.overscrollBehaviorX = previousHtmlOverscrollX
      body.style.overscrollBehaviorX = previousBodyOverscrollX
    }
  }, [open])
}

export function useBaseUrl() {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])
  return baseUrl
}

/** Returns the logged-in user's participant ID when they belong to the group. */
export function useGroupParticipantId(
  participants?: { id: string }[],
): string | undefined {
  const { data: profile } = trpc.profile.getProfile.useQuery()

  if (!profile?.id || !participants?.length) return undefined

  return participants.some((participant) => participant.id === profile.id)
    ? profile.id
    : undefined
}

interface FrankfurterAPIResponse {
  base: string
  date: string
  rates: Record<string, number>
}

const fetcher: Fetcher<FrankfurterAPIResponse> = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok)
      throw new TypeError('Unsuccessful response from API', { cause: res })
    return res.json() as Promise<FrankfurterAPIResponse>
  })

export function useCurrencyRate(
  date: Date | null,
  baseCurrency: string,
  targetCurrency: string,
) {
  const hasValidDate = date instanceof Date && !isNaN(date.getTime())
  const dateString = hasValidDate
    ? dayjs(date).format('YYYY-MM-DD')
    : dayjs().format('YYYY-MM-DD')

  // Only send request if both currency codes are given and not the same
  const url =
    hasValidDate &&
    !!baseCurrency.length &&
    !!targetCurrency.length &&
    baseCurrency !== targetCurrency &&
    `https://api.frankfurter.dev/v1/${dateString}?base=${baseCurrency}`
  const { data, error, isLoading, mutate } = useSWR<FrankfurterAPIResponse>(
    url,
    fetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )

  if (data) {
    let exchangeRate = undefined
    let sentError = error
    if (!error && data.date !== dateString) {
      // this happens if for example, the requested date is in the future.
      sentError = new RangeError(data.date)
    }
    if (data.rates[targetCurrency]) {
      exchangeRate = data.rates[targetCurrency]
    }
    return {
      data: exchangeRate,
      error: sentError,
      isLoading,
      refresh: mutate,
    }
  }

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  }
}
