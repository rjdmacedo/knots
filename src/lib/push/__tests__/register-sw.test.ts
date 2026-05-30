import { isPushSupported, registerServiceWorker } from '../register-sw'

describe('register-sw', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isPushSupported', () => {
    it('returns true when serviceWorker, PushManager, and Notification are available', () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'PushManager', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'Notification', {
        value: {},
        configurable: true,
      })

      expect(isPushSupported()).toBe(true)
    })

    it('returns false when serviceWorker is missing', () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        configurable: true,
      })
      Object.defineProperty(window, 'PushManager', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'Notification', {
        value: {},
        configurable: true,
      })

      // 'serviceWorker' in navigator checks for property existence, not truthiness
      // We need to delete it to make the `in` check fail
      delete (navigator as any).serviceWorker
      expect(isPushSupported()).toBe(false)
    })

    it('returns false when PushManager is missing', () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
      })
      delete (window as any).PushManager
      Object.defineProperty(window, 'Notification', {
        value: {},
        configurable: true,
      })

      expect(isPushSupported()).toBe(false)
    })

    it('returns false when Notification is missing', () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'PushManager', {
        value: {},
        configurable: true,
      })
      delete (window as any).Notification

      expect(isPushSupported()).toBe(false)
    })
  })

  describe('registerServiceWorker', () => {
    it('returns null when push is not supported', async () => {
      delete (navigator as any).serviceWorker

      const result = await registerServiceWorker()
      expect(result).toBeNull()
    })

    it('registers /sw.js and returns the registration', async () => {
      const mockRegistration = { scope: '/' } as ServiceWorkerRegistration
      const mockRegister = jest.fn().mockResolvedValue(mockRegistration)

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: mockRegister },
        configurable: true,
      })
      Object.defineProperty(window, 'PushManager', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'Notification', {
        value: {},
        configurable: true,
      })

      const result = await registerServiceWorker()

      expect(mockRegister).toHaveBeenCalledWith('/sw.js')
      expect(result).toBe(mockRegistration)
    })

    it('returns null and logs a warning when registration fails', async () => {
      const mockRegister = jest
        .fn()
        .mockRejectedValue(new Error('Registration failed'))
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: mockRegister },
        configurable: true,
      })
      Object.defineProperty(window, 'PushManager', {
        value: {},
        configurable: true,
      })
      Object.defineProperty(window, 'Notification', {
        value: {},
        configurable: true,
      })

      const result = await registerServiceWorker()

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        '[push] Service worker registration failed:',
        expect.any(Error),
      )
    })
  })
})
