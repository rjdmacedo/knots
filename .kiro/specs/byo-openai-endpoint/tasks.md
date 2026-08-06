# Implementation Plan: BYO OpenAI Endpoint

## Overview

Introduce two optional environment variables (`OPENAI_BASE_URL` and `OPENAI_MODEL`) that allow self-hosters to route AI requests to any OpenAI-compatible endpoint and choose a model. Implementation consolidates duplicated OpenAI client initialization into a shared module, updates the env schema with validation (empty string = unset via preprocess), and migrates both existing server actions to use the shared client.

## Tasks

- [x] 1. Extend environment schema with new variables
  - [x] 1.1 Add `OPENAI_BASE_URL` and `OPENAI_MODEL` to `src/lib/env.ts` Zod schema
    - Add `OPENAI_BASE_URL` with `z.preprocess()` that converts empty string → `undefined`, then `.string().url()` + http/https scheme `.refine()` + `.optional()`
    - Add `OPENAI_MODEL` with `z.preprocess()` that trims and converts empty → `undefined`, then `.string().max(128).optional()`
    - Place both fields adjacent to the existing `OPENAI_API_KEY` field
    - Existing `superRefine` block and `OPENAI_API_KEY` handling remain unchanged
    - _Requirements: 1.3, 1.4, 2.5, 3.1, 3.4, 3.5, 6.1, 6.2, 6.3_

- [x] 2. Create shared AI client module
  - [x] 2.1 Create `src/lib/ai-client.ts` with `getAIClient()` and `getAIModel()` functions
    - Export `AI_DEFAULT_MODELS` constant with `receiptExtract: 'gpt-4-turbo'` and `categoryExtract: 'gpt-3.5-turbo'`
    - Export `AIFeature` type (`keyof typeof AI_DEFAULT_MODELS`)
    - Implement `getAIClient()` as a lazy singleton that reads `env.OPENAI_API_KEY` and optionally `env.OPENAI_BASE_URL`
    - Implement `getAIModel(feature)` returning `env.OPENAI_MODEL ?? AI_DEFAULT_MODELS[feature]`
    - Throw descriptive error from `getAIClient()` if `OPENAI_API_KEY` is not set
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 1.1, 1.2, 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Write unit tests for AI client module
    - Test `getAIModel('receiptExtract')` returns `'gpt-4-turbo'` when `OPENAI_MODEL` unset
    - Test `getAIModel('categoryExtract')` returns `'gpt-3.5-turbo'` when `OPENAI_MODEL` unset
    - Test `getAIModel('receiptExtract')` returns configured value when `OPENAI_MODEL` is set
    - Test `getAIClient()` throws when `OPENAI_API_KEY` is not set
    - Test OpenAI constructor is called without `baseURL` when `OPENAI_BASE_URL` is unset
    - Test OpenAI constructor receives `baseURL` when `OPENAI_BASE_URL` is set
    - Create test file: `src/lib/ai-client.test.ts`
    - _Requirements: 2.3, 2.4, 4.4, 1.1, 1.2_

- [x] 3. Migrate server actions to shared AI client
  - [x] 3.1 Refactor `src/app/groups/[groupId]/expenses/create-from-receipt-button-actions.ts`
    - Remove local `getOpenAI()` function and direct `OpenAI` import
    - Import `getAIClient` and `getAIModel` from `@/lib/ai-client`
    - Replace hardcoded `model: 'gpt-4-turbo'` with `getAIModel('receiptExtract')`
    - Replace `getOpenAI()` call with `getAIClient()`
    - Remove unused `openai` package import if no longer needed directly
    - _Requirements: 4.3, 2.2, 1.1_

  - [x] 3.2 Refactor `src/components/expense-form-actions.tsx`
    - Remove local `getOpenAI()` function and direct `OpenAI` import
    - Import `getAIClient` and `getAIModel` from `@/lib/ai-client`
    - Replace hardcoded `model: 'gpt-3.5-turbo'` with `getAIModel('categoryExtract')`
    - Replace `getOpenAI()` call with `getAIClient()`
    - Retain the early-return guard `if (!env.OPENAI_API_KEY) return { categoryId: 0 }`
    - _Requirements: 4.3, 2.1, 1.1_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `pnpm test` and `pnpm check-types`; fix any regressions.

- [x] 5. Update documentation and environment example
  - [x] 5.1 Update `.env.example` with new variables
    - Add `OPENAI_BASE_URL` and `OPENAI_MODEL` grouped with existing OpenAI-related variables
    - Include comments explaining each variable's purpose
    - Include syntactically valid example values (e.g., `http://localhost:11434/v1` for base URL, `llava` for model)
    - Add a comment noting that `OPENAI_API_KEY` is still required even with keyless providers — use a dummy value (e.g. `ollama`)
    - _Requirements: 5.1, 5.4_

  - [x] 5.2 Update README "Opt-in features" section with BYO endpoint documentation
    - Document `OPENAI_BASE_URL` and `OPENAI_MODEL` as optional variables
    - List compatible providers (Ollama, LM Studio, OpenRouter)
    - Include at least one `.env` code block demonstrating both variables configured for a non-OpenAI provider (with dummy API key)
    - State default behavior when each variable is omitted
    - Warn that `OPENAI_MODEL` applies to both features; receipt scanning needs a vision-capable model (recommend multimodal, e.g. `llava`, `gpt-4-turbo`)
    - Note that `OPENAI_API_KEY` must be set to a dummy value for keyless providers
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Run `pnpm test` and `pnpm check-types`; fix any regressions.

## Notes

- Empty string values for `OPENAI_BASE_URL` and `OPENAI_MODEL` are preprocessed to `undefined` — this avoids Docker/compose environments triggering validation errors when vars are set but empty.
- Unit tests live in `src/lib/ai-client.test.ts`. Property tests (if added later) go to `src/lib/ai-client.property.test.ts`.
- Property tests (P1–P4 from design) are deferred from MVP due to low ROI for validating Zod primitives and mocking extractors end-to-end.
- The singleton pattern in `ai-client.ts` requires resetting state between tests (use `jest.resetModules()`).
- No database migrations needed — this feature is purely configuration-driven.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["5.1", "5.2"] }
  ]
}
```
