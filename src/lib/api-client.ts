import { has, isEmpty, isNil, isObject, isUndefined } from 'lodash-es'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type QueryParams = Record<string, string | number | boolean | undefined | null>

export type ApiRequestOptions = Omit<RequestInit, 'method' | 'body'> & {
  query?: QueryParams
  json?: unknown
}

function buildUrl(url: string, query?: QueryParams): string {
  if (isEmpty(query)) return url
  const u = new URL(
    url,
    typeof window === 'undefined'
      ? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
      : window.location.origin,
  )
  for (const [key, value] of Object.entries(query!)) {
    if (isNil(value)) continue
    u.searchParams.set(key, String(value))
  }
  return u.toString()
}

async function request<T = unknown>(
  url: string,
  method: HttpMethod,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { query, json, headers, ...init } = options

  const finalUrl = buildUrl(url, query)

  const res = await fetch(finalUrl, {
    method,
    headers: {
      ...(!isUndefined(json) ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: !isUndefined(json) ? JSON.stringify(json) : undefined,
    ...init,
  })

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    const contentType = res.headers.get('content-type') || ''
    try {
      if (contentType.includes('application/json')) {
        const errJson = (await res.json().catch(() => null)) as unknown
        if (isObject(errJson) && has(errJson, 'error')) {
          message = `${message} - ${String((errJson as any).error)}`
        }
      } else {
        const text = await res.text()
        if (text) message = `${message} - ${text}`
      }
    } catch {
      // ignore parse errors
    }
    const error = new Error(message)
    ;(error as any).status = res.status
    throw error
  }

  if (res.status === 204) return undefined as unknown as T
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export const api = {
  get: <T = unknown>(url: string, options?: ApiRequestOptions) =>
    request<T>(url, 'GET', options),
  post: <T = unknown>(url: string, options?: ApiRequestOptions) =>
    request<T>(url, 'POST', options),
  put: <T = unknown>(url: string, options?: ApiRequestOptions) =>
    request<T>(url, 'PUT', options),
  patch: <T = unknown>(url: string, options?: ApiRequestOptions) =>
    request<T>(url, 'PATCH', options),
  delete: <T = unknown>(url: string, options?: ApiRequestOptions) =>
    request<T>(url, 'DELETE', options),
}

export default api
