# Requirements Document

## Introduction

Allow self-hosters and developers to point the existing AI features (receipt scanning and category auto-assignment) at any OpenAI-compatible endpoint — such as Ollama, LM Studio, or OpenRouter — instead of requiring the official OpenAI API. This is achieved via two new optional environment variables (`OPENAI_BASE_URL` and `OPENAI_MODEL`) that configure the shared OpenAI client. When neither AI feature flag is enabled, no AI-related environment variable is required (preserving backward-compatible behaviour).

## Glossary

- **AI_Client**: The shared OpenAI SDK instance (`openai` npm package) used by receipt extraction and category extraction server actions.
- **AI_Feature_Flag**: Either of the two boolean environment variables that gate AI functionality: `NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT` and `NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT`.
- **Base_URL**: The root URL of an OpenAI-compatible HTTP API (e.g., `http://localhost:11434/v1` for Ollama, `https://openrouter.ai/api/v1` for OpenRouter).
- **Model_Identifier**: A string identifying the model to use for chat completions (e.g., `gpt-4-turbo`, `llama3`, `mistral`).
- **Env_Schema**: The Zod-based environment validation schema defined in `src/lib/env.ts`.
- **Receipt_Extractor**: The server action that sends a receipt image to the AI and parses amount, category, date, and title from the response.
- **Category_Extractor**: The server action that sends an expense title to the AI and returns a category ID.

## Requirements

### Requirement 1: Custom Base URL Configuration

**User Story:** As a self-hoster, I want to configure a custom OpenAI-compatible base URL, so that AI requests are routed to my preferred provider or local model server.

#### Acceptance Criteria

1. WHEN `OPENAI_BASE_URL` is set in the environment to a non-empty value, THE AI_Client SHALL pass that value as the `baseURL` option to the OpenAI SDK constructor so that all chat completion requests are routed to the specified endpoint.
2. WHEN `OPENAI_BASE_URL` is not set in the environment or is set to an empty string, THE AI_Client SHALL send requests to the default OpenAI API endpoint (`https://api.openai.com/v1`). An empty string SHALL be preprocessed to `undefined` (treated as absent), not rejected as a validation error.
3. THE Env_Schema SHALL preprocess `OPENAI_BASE_URL` by converting empty strings to `undefined`, then accept the result as an optional string that, when defined, must pass Zod `.url()` validation (RFC-compliant URL with `http` or `https` scheme).
4. IF `OPENAI_BASE_URL` is set to a non-empty value that fails URL validation (malformed URL or non-http/https scheme), THEN THE Env_Schema SHALL reject the configuration at application startup and report a validation error indicating the provided base URL is not a valid URL.

### Requirement 2: Custom Model Configuration

**User Story:** As a self-hoster, I want to specify which model to use for AI features, so that I can choose a model available on my endpoint that balances cost and quality.

#### Acceptance Criteria

1. WHEN `OPENAI_MODEL` is set to a non-empty value in the environment, THE Category_Extractor SHALL use that Model_Identifier for chat completions instead of the hardcoded default.
2. WHEN `OPENAI_MODEL` is set to a non-empty value in the environment, THE Receipt_Extractor SHALL use that Model_Identifier for chat completions instead of the hardcoded default.
3. WHEN `OPENAI_MODEL` is not set in the environment, THE Category_Extractor SHALL default to `gpt-3.5-turbo`.
4. WHEN `OPENAI_MODEL` is not set in the environment, THE Receipt_Extractor SHALL default to `gpt-4-turbo`.
5. THE Env_Schema SHALL preprocess `OPENAI_MODEL` by trimming whitespace and converting the result to `undefined` if empty, then accept it as an optional string with a maximum length of 128 characters. Whitespace-only values (after trim → empty) are treated as absent, not as validation errors.
6. WHEN `OPENAI_MODEL` is set, THE system SHALL apply the same model to both Receipt_Extractor and Category_Extractor. The documentation SHALL note that receipt scanning requires a vision-capable model, so self-hosters using local providers (Ollama, LM Studio) SHOULD choose a multimodal model if receipt scanning is enabled.

### Requirement 3: Backward-Compatible Feature Gating

**User Story:** As an operator who does not use AI features, I want the system to continue working without any AI environment variables, so that nothing breaks for deployments that do not opt in.

#### Acceptance Criteria

1. WHEN neither AI_Feature_Flag is enabled, THE Env_Schema SHALL accept the configuration as valid when `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` are all absent from the environment.
2. WHEN at least one AI_Feature_Flag is enabled and `OPENAI_API_KEY` is set to a non-empty string, THE Env_Schema SHALL accept the configuration as valid.
3. IF at least one AI_Feature_Flag is enabled and `OPENAI_API_KEY` is absent or empty, THEN THE Env_Schema SHALL reject the configuration with a validation error indicating that `OPENAI_API_KEY` is required when AI features are enabled.
4. WHEN at least one AI_Feature_Flag is enabled and `OPENAI_BASE_URL` is not set, THE Env_Schema SHALL accept the configuration as valid (Base_URL remains optional regardless of feature flags).
5. WHEN at least one AI_Feature_Flag is enabled and `OPENAI_MODEL` is not set, THE Env_Schema SHALL accept the configuration as valid (Model_Identifier remains optional regardless of feature flags).

### Requirement 4: Centralized AI Client Initialization

**User Story:** As a developer, I want a single shared AI client factory so that configuration changes apply uniformly to all AI call sites.

#### Acceptance Criteria

1. THE AI_Client initialization logic SHALL exist in a single shared module rather than being duplicated across call sites.
2. WHEN the AI_Client is instantiated, THE shared module SHALL pass `apiKey` and, if configured, `baseURL` from the environment to the OpenAI SDK constructor.
3. WHEN any server action invokes the AI_Client, THE server action SHALL import and call the shared module's factory function instead of directly instantiating the OpenAI SDK.
4. IF `OPENAI_API_KEY` is not set when the shared module's factory function is called, THEN THE shared module SHALL throw an error indicating that the API key is not configured.

### Requirement 5: Environment Example and Documentation

**User Story:** As a developer setting up the project, I want clear documentation of the new environment variables, so that I can configure an alternative AI endpoint without reading source code.

#### Acceptance Criteria

1. THE `.env.example` file SHALL list `OPENAI_BASE_URL` and `OPENAI_MODEL` grouped with the existing OpenAI-related variables, each accompanied by a comment stating the variable's purpose and a syntactically valid example value.
2. THE README "Opt-in features" section SHALL document `OPENAI_BASE_URL` and `OPENAI_MODEL`, stating that both are optional, listing compatible providers (Ollama, LM Studio, OpenRouter), and including at least one `.env` code block demonstrating both variables configured for a non-OpenAI provider.
3. THE README "Opt-in features" section SHALL state the default behavior when `OPENAI_BASE_URL` is omitted (requests go to the official OpenAI API) and when `OPENAI_MODEL` is omitted (the system uses its built-in default model per feature).
4. THE documentation (README and `.env.example`) SHALL note that `OPENAI_API_KEY` remains required when AI feature flags are enabled, even with providers that do not require a real key (e.g. Ollama, LM Studio). A dummy value such as `ollama` or `not-needed` may be used.
5. THE documentation SHALL warn that `OPENAI_MODEL` applies to both receipt scanning and category extraction; receipt scanning requires a vision-capable model, so self-hosters SHOULD choose a multimodal model (e.g. `llava`, `gpt-4-turbo`) if receipt scanning is enabled.

### Requirement 6: Validation of Custom Base URL Format

**User Story:** As an operator, I want the system to reject malformed base URLs at startup, so that misconfiguration is caught early rather than causing runtime failures.

#### Acceptance Criteria

1. WHEN `OPENAI_BASE_URL` is set to a non-empty value that does not conform to URL syntax with an `http` or `https` scheme, THE Env_Schema SHALL reject the configuration and prevent the application from starting, reporting a validation error message that identifies `OPENAI_BASE_URL` as the invalid variable.
2. WHEN `OPENAI_BASE_URL` is set to a valid URL with an `http` or `https` scheme (including URLs with a path component such as `/v1`), THE Env_Schema SHALL accept the configuration without error.
3. WHEN `OPENAI_BASE_URL` is set to an empty string, THE Env_Schema SHALL preprocess it to `undefined` (treated as absent) and accept the configuration without error.
