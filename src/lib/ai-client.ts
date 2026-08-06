import { env } from '@/lib/env'
import OpenAI from 'openai'

/** Default models per feature when OPENAI_MODEL is not set */
export const AI_DEFAULT_MODELS = {
  receiptExtract: 'gpt-4-turbo',
  categoryExtract: 'gpt-3.5-turbo',
} as const

export type AIFeature = keyof typeof AI_DEFAULT_MODELS

let _client: OpenAI | null = null

/**
 * Returns the shared OpenAI SDK instance configured from environment variables.
 * Throws if OPENAI_API_KEY is not set.
 */
export function getAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'OpenAI API key is not configured. Set OPENAI_API_KEY to use AI features.',
    )
  }

  if (!_client) {
    _client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    })
  }

  return _client
}

/**
 * Returns the model identifier for a given AI feature.
 * Uses OPENAI_MODEL env var when set, otherwise falls back to the feature-specific default.
 */
export function getAIModel(feature: AIFeature): string {
  return env.OPENAI_MODEL ?? AI_DEFAULT_MODELS[feature]
}
