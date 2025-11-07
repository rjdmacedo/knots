/**
 * Generic localStorage utilities for reading and writing values
 */

/**
 * Reads a value from localStorage and parses it as JSON
 * @param key - The localStorage key
 * @returns The parsed value or null if not found or on error
 */
export function readFromLocalStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const item = window.localStorage.getItem(key)
    return item ? (JSON.parse(item) as T) : null
  } catch (error) {
    console.error('Error reading from localStorage:', key, error)
    return null
  }
}
/**
 * Writes a value to localStorage as JSON
 * @param key - The localStorage key
 * @param value - The value to store (null removes the item)
 */
export function writeToLocalStorage<T>(key: string, value: T | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (error) {
    console.error('Error writing to localStorage:', key, value, error)
  }
}
