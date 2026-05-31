/**
 * Return URL Validator — validates return URLs after login.
 * Rejects external domains, non-app protocols, and malformed URLs.
 */

/**
 * Validates a return URL to ensure it belongs to the application.
 * Returns the validated path (pathname + search + hash) or null if invalid.
 *
 * Security considerations:
 * - Rejects URLs with external domains (open redirect prevention)
 * - Rejects non-http(s) protocols (javascript:, data:, etc.)
 * - Rejects protocol-relative URLs (//evil.com)
 * - Handles malformed URLs gracefully
 */
export function validateReturnUrl(url: string, baseUrl: string): string | null {
  // Reject empty or whitespace-only strings
  if (!url || !url.trim()) {
    return null
  }

  // Reject protocol-relative URLs (//evil.com/path)
  // These would resolve to the current protocol + external domain
  if (url.startsWith('//')) {
    return null
  }

  try {
    const base = new URL(baseUrl)

    // Parse the URL using baseUrl as the base for relative URLs
    const parsed = new URL(url, baseUrl)

    // Reject non-http(s) protocols (javascript:, data:, ftp:, etc.)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    // Reject external domains — origin must match
    if (parsed.origin !== base.origin) {
      return null
    }

    // Return the path portion (pathname + search + hash)
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    // Malformed URL — URL constructor threw
    return null
  }
}
