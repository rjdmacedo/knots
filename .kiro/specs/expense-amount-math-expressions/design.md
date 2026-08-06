# Design Document: Expense Amount Math Expressions

## Overview

This feature adds arithmetic expression evaluation to the expense and payment amount fields, letting users type expressions like `12+4.50`, `100/3`, or `(50+25)*2` directly into the amount input. The expression is evaluated on blur (or at form submission time if still unevaluated) and the result replaces the raw text.

The design introduces:

1. A **pure expression evaluator module** (`src/lib/math-expression.ts`) implementing a recursive-descent parser and tree-walking evaluator.
2. An **update to `CurrencyAmountInput`** to invoke the evaluator on blur and display the computed result.
3. A **Zod schema transform** in `src/lib/schemas.ts` that evaluates any remaining expression string before numeric validation.

The evaluator is intentionally pure (no DOM, no React, no I/O) to enable exhaustive property-based testing with `fast-check`.

## Architecture

```mermaid
flowchart TD
    subgraph UI Layer
        EF[ExpenseForm / PaymentForm]
        CAI[CurrencyAmountInput]
    end

    subgraph Pure Logic
        ME[math-expression.ts]
        subgraph Evaluator
            TOK[tokenize]
            PARSE[parse → AST]
            EVAL[evaluate AST → number]
            PP[prettyPrint AST → string]
        end
    end

    subgraph Validation
        ZOD[schemas.ts – amount transform]
    end

    EF -->|field.value| CAI
    CAI -->|onBlur| ME
    ME --> TOK --> PARSE --> EVAL
    PARSE --> PP
    CAI -->|onValueChange(result)| EF
    EF -->|submit| ZOD
    ZOD -->|string input| ME
    ZOD -->|numeric output| DB[(Persist)]
```

### Parsing Approach: Recursive Descent

A hand-written recursive-descent parser is chosen over alternatives (regex, `eval`, or library-based) because:

- **Security**: No use of `eval()` or `Function()` — the parser only recognizes arithmetic tokens.
- **Simplicity**: The grammar is tiny (4 operators, parentheses, unary minus, decimal numbers). A recursive-descent parser is ~80 lines of TypeScript.
- **Error reporting**: Hand-written parsers produce precise error positions, enabling future UX improvements (e.g., inline caret highlighting).
- **No dependencies**: Keeps the bundle small; no runtime dependency added.
- **Testability**: The AST is a plain data structure, enabling structural property-based tests.

### Grammar (EBNF)

```
Expression  = Term (('+' | '-') Term)*
Term        = Factor (('*' | '/') Factor)*
Factor      = '-' Factor | Atom
Atom        = '(' Expression ')' | Number
Number      = Digit+ (DecimalSep Digit+)?
DecimalSep  = '.' | ','
Digit       = '0' | '1' | ... | '9'
```

This grammar naturally encodes standard operator precedence (multiplication/division bind tighter than addition/subtraction) and supports unary minus at the start or after `(`.

## Components and Interfaces

### 1. `src/lib/math-expression.ts` — Pure Evaluator Module

```typescript
// --- AST Types ---

type NumberNode = { type: 'number'; value: number }
type UnaryNode = { type: 'unary'; operator: '-'; operand: ExprNode }
type BinaryNode = {
  type: 'binary'
  operator: '+' | '-' | '*' | '/'
  left: ExprNode
  right: ExprNode
}
type ExprNode = NumberNode | UnaryNode | BinaryNode

// --- Result Types ---

type EvalSuccess = { ok: true; value: number }
type EvalError = { ok: false; error: string }
type EvalResult = EvalSuccess | EvalError

// --- Public API ---

/** Evaluate an arithmetic expression string to a numeric result. */
export function evaluate(input: string): EvalResult

/**
 * Parse an expression string into an AST.
 * Returns the AST or an error.
 */
export function parse(
  input: string,
): { ok: true; ast: ExprNode } | { ok: false; error: string }

/**
 * Pretty-print an AST back into a canonical expression string.
 * Uses minimal parentheses based on operator precedence.
 */
export function prettyPrint(node: ExprNode): string

/**
 * Check if a string contains any arithmetic operators,
 * indicating it's an expression rather than a plain number.
 */
export function isExpression(input: string): boolean
```

**Design decisions:**

- `evaluate` is the primary entry point for the UI and schema layers. It encapsulates tokenize → parse → eval.
- `parse` and `prettyPrint` are exposed for round-trip property testing and potential future use (e.g., showing a preview of the parsed expression).
- `isExpression` is a fast regex check (`/[+\-*/()]/` after stripping leading minus) used by the schema to decide whether to attempt evaluation or fall through to plain `Number()` parsing.
- The result type uses a discriminated union (`ok: true/false`) rather than exceptions, making error handling explicit and composable.

### 2. `src/components/currency-amount-input.tsx` — Updated Component

Changes to the existing component:

```typescript
// New import
import { evaluate, isExpression } from '@/lib/math-expression'

// Updated onBlur handler (inside the component):
onBlur={(event) => {
  setIsFocused(false)

  if (isExpression(draft)) {
    const result = evaluate(draft)
    if (result.ok) {
      // Format the result for the currency and propagate
      const formatted = String(result.value)
      setDraft('')
      onValueChange(formatted)
    } else {
      // Leave the draft as-is; validation will catch it
      setDraft('')
      onValueChange(draft) // propagate raw for schema validation
    }
  } else {
    setDraft('')
  }

  onBlur?.(event)
}}
```

Additional changes:

- `inputMode` changes from `"decimal"` to `"text"` to allow operators on mobile keyboards.
- `placeholder` updated to hint expression support (e.g., `"0.00 or 10+5"`).
- The `enforceCurrencyPattern` call in `onChange` is conditionally bypassed when the input contains operator characters — instead, a lighter `enforceExpressionPattern` is used that allows `+`, `-`, `*`, `/`, `(`, `)`, digits, `.`, `,`, and whitespace.

### 3. `src/lib/schemas.ts` — Amount Schema Transform

The existing amount field schema uses a `z.string().transform()` that calls `Number(value)`. This is updated to first attempt expression evaluation:

```typescript
import { evaluate, isExpression } from '@/lib/math-expression'

// Shared transform for amount fields
function expressionToNumber(value: string, ctx: z.RefinementCtx): number {
  // Fast path: plain number
  if (!isExpression(value)) {
    const num = Number(value)
    if (Number.isNaN(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalidNumber' })
      return 0
    }
    return num
  }

  // Expression path
  const result = evaluate(value)
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalidExpression' })
    return 0
  }
  return result.value
}
```

This transform is used in both `expenseFormSchema.amount` and `paymentFormSchema.amount`.

### 4. `src/lib/currency-input.ts` — New Helper

A new exported function for expression-aware input filtering:

```typescript
/**
 * Allow characters valid in arithmetic expressions:
 * digits, decimal separators (. ,), operators (+ - * /), parentheses, whitespace.
 */
export const enforceExpressionPattern = (value: string): string =>
  value.replace(/[^\d.,+\-*/() ]/g, '')
```

## Data Models

No database schema changes are required. The expression is always evaluated to a plain number before persistence. The amount field in Prisma (`amount Int` stored as minor units) remains unchanged.

**Data flow:**

1. User types `"50+25"` → stored in form state as string `"50+25"`
2. On blur → evaluated to `75` → `onValueChange("75")` → form state becomes `"75"`
3. On submit → schema transform receives `"75"` (or raw expression if blur didn't fire) → evaluates to `75` → validated → converted to minor units (7500) → persisted

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Evaluator Arithmetic Correctness

_For any_ valid arithmetic expression composed of numbers and the operators `+`, `-`, `*`, `/` with optional parentheses and unary minus, the `evaluate` function SHALL produce a result numerically equal to the same expression evaluated by JavaScript's native arithmetic (within floating-point tolerance).

**Validates: Requirements 1.2, 3.1, 3.2, 3.3, 3.4**

### Property 2: Parse/Print Round-Trip

_For any_ valid arithmetic expression string, `parse(prettyPrint(parse(expr).ast)).ast` SHALL be structurally equivalent to `parse(expr).ast` — that is, parsing, pretty-printing, and re-parsing produces an equivalent expression tree.

**Validates: Requirements 6.3, 6.4**

### Property 3: Locale Decimal Equivalence

_For any_ valid arithmetic expression containing `.` as a decimal separator, replacing each `.` with `,` (in numeric literal positions) SHALL produce an expression that evaluates to the same numeric result.

**Validates: Requirements 4.1, 4.2**

### Property 4: Invalid Input Rejection

_For any_ string containing characters outside the allowed set (digits, `.`, `,`, `+`, `-`, `*`, `/`, `(`, `)`, whitespace), OR containing syntax errors (unbalanced parentheses, consecutive operators, trailing operators, empty parentheses, division by zero), the `evaluate` function SHALL return `{ ok: false }`.

**Validates: Requirements 3.5, 5.1, 5.2, 5.3, 5.4**

### Property 5: Schema Expression Evaluation Consistency

_For any_ valid arithmetic expression string, passing it through the Zod amount schema transform SHALL produce a numeric value equal to `evaluate(expr).value`.

**Validates: Requirements 2.1, 2.2**

## Error Handling

| Scenario                                        | Layer                                                                           | Behavior                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Syntax error (e.g., `5++3`, `(5+)`, `()`)       | Evaluator → returns `{ ok: false, error: "..." }`                               | UI shows validation error via form message |
| Invalid characters (e.g., `5+abc`)              | `enforceExpressionPattern` strips them on input; if bypassed, evaluator rejects | Schema rejects on submit                   |
| Division by zero (e.g., `10/0`, `5/(3-3)`)      | Evaluator detects non-finite result → returns `{ ok: false }`                   | UI shows "invalid expression" error        |
| Overflow / NaN                                  | Evaluator checks `Number.isFinite(result)` → returns `{ ok: false }`            | Schema rejects                             |
| Unbalanced parentheses (e.g., `(5+3`, `5+3)`)   | Parser detects during recursive descent → returns error with position           | UI shows validation error                  |
| Empty input                                     | `isExpression("")` returns `false` → falls through to existing behavior         | Existing "amount required" validation      |
| Expression evaluates to zero                    | Evaluator succeeds with `0` → existing `amountNotZero` refinement rejects       | Existing error message shown               |
| Expression evaluates to negative (payment form) | Evaluator succeeds → existing `amount > 0` refinement rejects                   | Existing error message shown               |

### i18n Error Messages

New message key added to `messages/*.json`:

```json
{
  "ExpenseForm": {
    "invalidExpression": "Invalid expression. Use numbers and +, -, *, / operators."
  }
}
```

## Testing Strategy

### Property-Based Tests (`src/lib/math-expression.property.test.ts`)

Using `fast-check` (already a devDependency), with 200 runs per property:

| Property                  | Generator Strategy                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Arithmetic Correctness | Generate random ASTs (depth ≤ 4), pretty-print to string, evaluate, compare to reference JS computation on the AST                        |
| 2: Round-Trip             | Generate random ASTs, prettyPrint → parse → compare AST equality                                                                          |
| 3: Locale Equivalence     | Generate expressions with `.` decimals, create `,` variant, compare evaluate results                                                      |
| 4: Invalid Rejection      | Generate strings with invalid chars (fc.string filtered), and structurally invalid expressions (unbalanced parens, consecutive operators) |
| 5: Schema Consistency     | Generate valid expressions, run through Zod schema, compare to direct evaluate                                                            |

**Configuration:**

- Minimum 200 iterations per property (`numRuns: 200`)
- Each test tagged with: `Feature: expense-amount-math-expressions, Property N: <title>`

### Unit Tests (`src/lib/math-expression.test.ts`)

Example-based tests for:

- Specific expressions: `"12+4.50"` → `16.5`, `"100/3"` → `33.333...`, `"(50+25)*2"` → `150`
- Edge cases: `"-5+3"` → `-2`, `"(-5+3)"` → `-2`, `"0.1+0.2"` → `0.3` (within tolerance)
- Division by zero: `"10/0"` → error
- Unbalanced parens: `"(5+3"` → error
- Empty parentheses: `"()"` → error
- Comma decimals: `"10,50+2,25"` → `12.75`
- Whitespace: `" 5 + 3 "` → `8`
- Large numbers: `"99999*99999"` → `9999800001`
- Trailing operator: `"5+"` → error

### Component Tests

Example-based tests for `CurrencyAmountInput`:

- Verify `inputMode="text"` attribute
- Verify placeholder includes expression hint
- Verify onBlur evaluates expression and calls onValueChange with result
- Verify focused state shows raw draft text

## File Change Summary

| File                                       | Change                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/math-expression.ts`               | **New** — Pure evaluator module (tokenize, parse, evaluate, prettyPrint, isExpression)                                   |
| `src/lib/math-expression.test.ts`          | **New** — Unit tests for the evaluator                                                                                   |
| `src/lib/math-expression.property.test.ts` | **New** — Property-based tests (5 properties, 200 runs each)                                                             |
| `src/components/currency-amount-input.tsx` | **Modified** — Add expression evaluation on blur, change inputMode, update placeholder, conditional input filtering      |
| `src/lib/currency-input.ts`                | **Modified** — Add `enforceExpressionPattern` helper                                                                     |
| `src/lib/schemas.ts`                       | **Modified** — Update amount transforms to evaluate expressions before numeric coercion; add `expressionToNumber` helper |
| `messages/en-US.json`                      | **Modified** — Add `invalidExpression` message key                                                                       |
| `messages/de-DE.json` (and other locales)  | **Modified** — Add translated `invalidExpression` message                                                                |
