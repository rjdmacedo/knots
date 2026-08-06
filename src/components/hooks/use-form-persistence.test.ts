/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { useFormPersistence } from './use-form-persistence'

describe('useFormPersistence', () => {
  const TEST_KEY = 'test-form-key'

  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('save', () => {
    it('serializes data to sessionStorage and returns true', () => {
      const { result } = renderHook(() =>
        useFormPersistence<{ name: string }>({ key: TEST_KEY }),
      )

      let success: boolean
      act(() => {
        success = result.current.save({ name: 'Lunch' })
      })

      expect(success!).toBe(true)
      expect(sessionStorage.getItem(TEST_KEY)).toBe(
        JSON.stringify({ name: 'Lunch' }),
      )
    })

    it('returns false when sessionStorage throws (e.g., quota exceeded)', () => {
      const spy = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new DOMException('QuotaExceededError')
        })

      const { result } = renderHook(() =>
        useFormPersistence<{ name: string }>({ key: TEST_KEY }),
      )

      let success: boolean
      act(() => {
        success = result.current.save({ name: 'Lunch' })
      })

      expect(success!).toBe(false)
      spy.mockRestore()
    })

    it('returns false when data has circular references', () => {
      const { result } = renderHook(() =>
        useFormPersistence<unknown>({ key: TEST_KEY }),
      )

      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular

      let success: boolean
      act(() => {
        success = result.current.save(circular)
      })

      expect(success!).toBe(false)
    })
  })

  describe('restore', () => {
    it('returns deserialized data from sessionStorage', () => {
      sessionStorage.setItem(TEST_KEY, JSON.stringify({ amount: 500 }))

      const { result } = renderHook(() =>
        useFormPersistence<{ amount: number }>({ key: TEST_KEY }),
      )

      let data: { amount: number } | null
      act(() => {
        data = result.current.restore()
      })

      expect(data!).toEqual({ amount: 500 })
    })

    it('returns null when key is missing', () => {
      const { result } = renderHook(() =>
        useFormPersistence<{ amount: number }>({ key: TEST_KEY }),
      )

      let data: { amount: number } | null
      act(() => {
        data = result.current.restore()
      })

      expect(data!).toBeNull()
    })

    it('returns null when stored data is corrupt JSON', () => {
      sessionStorage.setItem(TEST_KEY, '{not-valid-json')

      const { result } = renderHook(() =>
        useFormPersistence<{ amount: number }>({ key: TEST_KEY }),
      )

      let data: { amount: number } | null
      act(() => {
        data = result.current.restore()
      })

      expect(data!).toBeNull()
    })

    it('returns null when sessionStorage.getItem throws', () => {
      const spy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('Access denied')
        })

      const { result } = renderHook(() =>
        useFormPersistence<{ amount: number }>({ key: TEST_KEY }),
      )

      let data: { amount: number } | null
      act(() => {
        data = result.current.restore()
      })

      expect(data!).toBeNull()
      spy.mockRestore()
    })
  })

  describe('clear', () => {
    it('removes the key from sessionStorage', () => {
      sessionStorage.setItem(TEST_KEY, JSON.stringify({ name: 'Lunch' }))

      const { result } = renderHook(() =>
        useFormPersistence<{ name: string }>({ key: TEST_KEY }),
      )

      act(() => {
        result.current.clear()
      })

      expect(sessionStorage.getItem(TEST_KEY)).toBeNull()
    })

    it('does not throw when sessionStorage.removeItem fails', () => {
      const spy = jest
        .spyOn(Storage.prototype, 'removeItem')
        .mockImplementation(() => {
          throw new Error('Access denied')
        })

      const { result } = renderHook(() =>
        useFormPersistence<{ name: string }>({ key: TEST_KEY }),
      )

      expect(() => {
        act(() => {
          result.current.clear()
        })
      }).not.toThrow()

      spy.mockRestore()
    })
  })

  describe('round-trip', () => {
    it('save followed by restore returns the same data', () => {
      const { result } = renderHook(() =>
        useFormPersistence<{ title: string; amount: number }>({
          key: TEST_KEY,
        }),
      )

      const original = { title: 'Dinner', amount: 2500 }

      act(() => {
        result.current.save(original)
      })

      let restored: { title: string; amount: number } | null
      act(() => {
        restored = result.current.restore()
      })

      expect(restored!).toEqual(original)
    })
  })
})
