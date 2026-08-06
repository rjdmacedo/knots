# Implementation Plan: Expense Amount Math Expressions

## Overview

Implement arithmetic expression evaluation in the expense and payment amount fields. Users can type expressions like `12+4.50`, `100/3`, or `(50+25)*2` directly into the amount input. The expression is evaluated on blur or form submission. The implementation follows a bottom-up approach: pure evaluator module → unit/property tests → schema integration → UI component update → i18n.

## Tasks

- [x] 1. Implement the pure expression evaluator module
  - [x] 1.1 Create `src/lib/math-expression.ts` with AST types, tokenizer, recursive-descent parser, evaluator, prettyPrint, and isExpression
    - Define `ExprNode` discriminated union types (`NumberNode`, `UnaryNode`, `BinaryNode`)
    - Define `EvalResult` discriminated union (`EvalSuccess | EvalError`)
    - Implement `tokenize(input: string)` — converts input string into a token array (numbers, operators, parens), handling both `.` and `,` as decimal separators
    - Implement `parse(input: string)` — recursive-descent parser following the EBNF grammar: `Expression → Term (('+' | '-') Term)*`, `Term → Factor (('*' | '/') Factor)*`, `Factor → '-' Factor | Atom`, `Atom → '(' Expression ')' | Number`
    - Implement `evaluate(input: string): EvalResult` — parses then tree-walks the AST; returns `{ ok: false }` for division by zero, non-finite results, or syntax errors
    - Implement `prettyPrint(node: ExprNode): string` — canonical string representation with minimal parentheses based on operator precedence
    - Implement `isExpression(input: string): boolean` — fast regex check for operator characters (excluding leading unary minus)
    - Reject characters outside the allowed set: digits, `.`, `,`, `+`, `-`, `*`, `/`, `(`, `)`, whitespace
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [x] 1.2 Write unit tests for the expression evaluator in `src/lib/math-expression.test.ts`
    - Test basic arithmetic: `"12+4.50"` → `16.5`, `"100/3"` → `33.333...`, `"(50+25)*2"` → `150`
    - Test unary minus: `"-5+3"` → `-2`, `"(-5+3)"` → `-2`
    - Test operator precedence: `"2+3*4"` → `14`, `"(2+3)*4"` → `20`
    - Test comma decimals: `"10,50+2,25"` → `12.75`
    - Test whitespace handling: `" 5 + 3 "` → `8`
    - Test error cases: division by zero (`"10/0"`), unbalanced parens (`"(5+3"`), trailing operator (`"5+"`), empty parens (`"()"`), consecutive operators (`"5++3"`), invalid characters (`"5+abc"`)
    - Test edge cases: large numbers (`"99999*99999"`), deeply nested parens, single number passthrough
    - Test `isExpression` correctly identifies expressions vs plain numbers
    - Test `prettyPrint` produces canonical output
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 5.1, 5.3, 5.4, 6.3_

  - [x] 1.3 Write property-based tests in `src/lib/math-expression.property.test.ts`
    - **Property 1: Evaluator Arithmetic Correctness** — Generate random ASTs (depth ≤ 4) using fast-check arbitraries, prettyPrint to string, evaluate, compare to reference JS computation on the AST (within floating-point tolerance). Avoid division by zero in generated trees.
    - **Validates: Requirements 1.2, 3.1, 3.2, 3.3, 3.4**
    - **Property 2: Parse/Print Round-Trip** — Generate random ASTs, prettyPrint → parse → compare structural AST equality.
    - **Validates: Requirements 6.3, 6.4**
    - **Property 3: Locale Decimal Equivalence** — Generate expressions with `.` decimals, create `,` variant, compare evaluate results are equal.
    - **Validates: Requirements 4.1, 4.2**
    - **Property 4: Invalid Input Rejection** — Generate strings with invalid characters and structurally invalid expressions, verify `evaluate` returns `{ ok: false }`.
    - **Validates: Requirements 3.5, 5.1, 5.2, 5.3, 5.4**
    - Configure `numRuns: 200` for each property
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 2. Checkpoint - Core evaluator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Integrate expression evaluation into Zod schemas
  - [x] 3.1 Add `enforceExpressionPattern` helper to `src/lib/currency-input.ts`
    - Export `enforceExpressionPattern(value: string): string` that strips characters not in the set: digits, `.`, `,`, `+`, `-`, `*`, `/`, `(`, `)`, whitespace
    - _Requirements: 3.5, 5.1_

  - [x] 3.2 Update `src/lib/schemas.ts` with expression-aware amount transforms
    - Import `evaluate` and `isExpression` from `@/lib/math-expression`
    - Create shared `expressionToNumber(value: string, ctx: z.RefinementCtx): number` helper that: uses `isExpression` for fast-path detection, calls `evaluate` for expression strings, falls back to `Number()` for plain numbers, adds `invalidExpression` issue code on evaluation failure
    - Replace the inline `.transform()` in `expenseFormSchema.amount` to use `expressionToNumber`
    - Replace the inline `.transform()` in `paymentAmountSchema` to use `expressionToNumber`
    - _Requirements: 2.1, 2.2, 5.2_

  - [x] 3.3 Write property-based test for schema consistency in `src/lib/math-expression.property.test.ts`
    - **Property 5: Schema Expression Evaluation Consistency** — Generate valid expression strings, pass through the Zod amount schema transform, verify result equals `evaluate(expr).value`.
    - **Validates: Requirements 2.1, 2.2**
    - _Requirements: 2.1, 2.2_

- [x] 4. Update the CurrencyAmountInput component
  - [x] 4.1 Modify `src/components/currency-amount-input.tsx` to evaluate expressions on blur
    - Import `evaluate` and `isExpression` from `@/lib/math-expression`
    - Import `enforceExpressionPattern` from `@/lib/currency-input`
    - Update `onBlur` handler: if `isExpression(draft)`, call `evaluate(draft)`; if `result.ok`, call `onValueChange(String(result.value))`; if not ok, propagate raw draft for schema validation to catch
    - Update `onChange` handler: detect if input contains operator characters; if so, use `enforceExpressionPattern` instead of `enforceCurrencyPattern`
    - Change `inputMode` from `"decimal"` to `"text"` to allow operator entry on mobile keyboards
    - Update `placeholder` to include expression hint (e.g., `"0.00 or 10+5"`) using a new helper or inline logic combining `getCurrencyInputPlaceholder` with expression hint
    - Preserve existing behavior: while focused, display raw draft text; on blur with plain number, existing formatting applies
    - _Requirements: 1.1, 1.2, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2_

  - [x] 4.2 Write unit tests for `CurrencyAmountInput` expression behavior
    - Test that `inputMode` is `"text"`
    - Test that placeholder includes expression hint text
    - Test that onBlur with a valid expression calls `onValueChange` with the evaluated numeric result
    - Test that onBlur with an invalid expression propagates the raw string
    - Test that focused state shows raw draft without evaluation
    - Test that plain numbers continue to work as before (no regression)
    - _Requirements: 1.1, 1.2, 7.4, 8.1, 8.2_

- [x] 5. Checkpoint - Schema and component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Add i18n messages and finalize integration
  - [x] 6.1 Add `invalidExpression` error message to locale files
    - Add `"invalidExpression": "Invalid expression. Use numbers and +, -, *, / operators."` under the appropriate namespace in `messages/en-US.json`
    - Add translated equivalent to other locale files (e.g., `messages/de-DE.json`)
    - _Requirements: 5.1, 5.2_

  - [x] 6.2 Wire error message display in form validation feedback
    - Ensure the `invalidExpression` message key from the schema is picked up by the form's error display logic (verify `ExpenseForm` and `PaymentForm` render the message via `next-intl` translation)
    - _Requirements: 5.1, 5.2, 7.1, 7.2_

- [x] 7. Final checkpoint - All tests pass and types check
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are mandatory — property-based tests are critical for a pure arithmetic utility
- Each task references specific requirements for traceability
- The evaluator is intentionally pure (no DOM, no React, no I/O) enabling exhaustive property-based testing with `fast-check`
- The recursive-descent parser produces an AST as a plain data structure, enabling structural property tests
- No database schema changes are required — expressions are always evaluated to numbers before persistence
- The `enforceExpressionPattern` filter provides defense-in-depth at the input layer, while the evaluator's character allowlist provides the authoritative rejection
- Rounding for currency precision is handled by the existing `formatCurrencyInputValue` (via `Intl.NumberFormat`) after evaluation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2"] }
  ]
}
```
