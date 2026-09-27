import {
  getOrCreatePushSubscription,
  isPushSupported,
  registerServiceWorker,
  urlBase64ToUint8Array,
} from '../register-sw'

describe('register-sw', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isPushSupported', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        configurable: true,
      })
    })

    it('returns false outside a secure context', () => {
      Object.defineProperty(window, 'isSecureContext', {
        value: false,
        configurable: true,
      })
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

      expect(isPushSupported()).toBe(false)
    })

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
    beforeEach(() => {
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        configurable: true,
      })
    })

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

  describe('urlBase64ToUint8Array', () => {
    it('decodes URL-safe base64 without padding', () => {
      // "Hi" in base64url
      const bytes = urlBase64ToUint8Array('SGk')
      expect(Array.from(bytes)).toEqual([72, 105])
    })
  })

  describe('getOrCreatePushSubscription', () => {
    it('returns the existing subscription when present', async () => {
      const existing = {
        endpoint: 'https://push.example/1',
      } as PushSubscription
      const registration = {
        pushManager: {
          getSubscription: jest.fn().mockResolvedValue(existing),
          subscribe: jest.fn(),
        },
      } as unknown as ServiceWorkerRegistration

      const result = await getOrCreatePushSubscription(registration, 'SGk')

      expect(result).toBe(existing)
      expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    })

    it('returns null when vapid key is missing', async () => {
      const registration = {
        pushManager: {
          getSubscription: jest.fn().mockResolvedValue(null),
          subscribe: jest.fn(),
        },
      } as unknown as ServiceWorkerRegistration

      const result = await getOrCreatePushSubscription(registration, undefined)

      expect(result).toBeNull()
      expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    })

    it('returns null and warns when push service rejects subscribe', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const abort = new DOMException(
        'Registration failed - push service not available',
        'AbortError',
      )
      const subscribe = jest.fn().mockRejectedValue(abort)
      const registration = {
        pushManager: {
          getSubscription: jest.fn().mockResolvedValue(null),
          subscribe,
        },
      } as unknown as ServiceWorkerRegistration

      const result = await getOrCreatePushSubscription(registration, 'SGk')

      expect(result).toBeNull()
      expect(subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      })
      expect(warnSpy).toHaveBeenCalledWith(
        '[push] Push subscription failed:',
        abort,
      )
    })
  })
})
