const mockOpenAIConstructor = jest.fn()

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class MockOpenAI {
      constructor(opts: Record<string, unknown>) {
        mockOpenAIConstructor(opts)
      }
    },
  }
})

let mockEnv: Record<string, string | undefined> = {}

jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv
  },
}))

describe('ai-client', () => {
  beforeEach(() => {
    jest.resetModules()
    mockOpenAIConstructor.mockClear()
    mockEnv = {}
  })

  describe('getAIModel', () => {
    it("returns 'gpt-4-turbo' for receiptExtract when OPENAI_MODEL is unset", () => {
      mockEnv = { OPENAI_API_KEY: 'test-key' }
      const { getAIModel } = require('@/lib/ai-client')
      expect(getAIModel('receiptExtract')).toBe('gpt-4-turbo')
    })

    it("returns 'gpt-3.5-turbo' for categoryExtract when OPENAI_MODEL is unset", () => {
      mockEnv = { OPENAI_API_KEY: 'test-key' }
      const { getAIModel } = require('@/lib/ai-client')
      expect(getAIModel('categoryExtract')).toBe('gpt-3.5-turbo')
    })

    it('returns the configured OPENAI_MODEL value when set', () => {
      mockEnv = { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'llava' }
      const { getAIModel } = require('@/lib/ai-client')
      expect(getAIModel('receiptExtract')).toBe('llava')
    })
  })

  describe('getAIClient', () => {
    it('throws when OPENAI_API_KEY is not set', () => {
      mockEnv = {}
      const { getAIClient } = require('@/lib/ai-client')
      expect(() => getAIClient()).toThrow(
        'OpenAI API key is not configured. Set OPENAI_API_KEY to use AI features.',
      )
    })

    it('calls OpenAI constructor without baseURL when OPENAI_BASE_URL is unset', () => {
      mockEnv = { OPENAI_API_KEY: 'test-key' }
      const { getAIClient } = require('@/lib/ai-client')
      getAIClient()
      expect(mockOpenAIConstructor).toHaveBeenCalledWith({
        apiKey: 'test-key',
      })
    })

    it('calls OpenAI constructor with baseURL when OPENAI_BASE_URL is set', () => {
      mockEnv = {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'http://localhost:11434/v1',
      }
      const { getAIClient } = require('@/lib/ai-client')
      getAIClient()
      expect(mockOpenAIConstructor).toHaveBeenCalledWith({
        apiKey: 'test-key',
        baseURL: 'http://localhost:11434/v1',
      })
    })
  })
})
