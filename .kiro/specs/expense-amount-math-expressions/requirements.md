# Requirements Document

## Introduction

Allow users to enter arithmetic expressions (e.g. `12+4.50`, `100/3`, `(50+25)*2`) in the expense and payment amount fields. The expression is evaluated to a final currency value on blur or form submission, replacing the raw text with the computed result. This removes the need for users to reach for a calculator when splitting bills or summing line items mentally.

The feature introduces a pure expression evaluator utility in `src/lib/`, updates the `CurrencyAmountInput` component to accept and resolve expressions, and adjusts Zod validation in `src/lib/schemas.ts` to allow expression strings before coercion.

## Glossary

- **Expression_Evaluator**: A pure utility module (`src/lib/math-expression.ts`) responsible for parsing and evaluating arithmetic expression strings into numeric results.
- **Amount_Input**: The `CurrencyAmountInput` component used in `ExpenseForm` and `PaymentForm` for entering monetary values.
- **Arithmetic_Expression**: A string containing decimal numbers and the operators `+`, `-`, `*`, `/`, and parentheses `(` `)`, with locale-aware decimal separators (`.` or `,`).
- **Evaluation**: The process of computing the numeric result of a valid Arithmetic_Expression.
- **Locale_Decimal_Separator**: The character used as a decimal point in the user's locale (`.` in `en-US`, `,` in `de-DE`).
- **Amount_Schema**: The Zod validation schema for the `amount` field in `expenseFormSchema` and `paymentFormSchema` in `src/lib/schemas.ts`.

## Requirements

### Requirement 1: Expression Evaluation on Blur

**User Story:** As a user, I want to type arithmetic expressions into the amount field and have them evaluated automatically when I leave the field, so that I can quickly compute totals without using a separate calculator.

#### Acceptance Criteria

1. WHEN the user enters a valid Arithmetic_Expression into the Amount_Input and the field loses focus, THE Amount_Input SHALL evaluate the expression and replace the displayed text with the computed numeric result formatted according to the field's currency and locale.
2. WHEN the user enters a plain numeric value (no operators) into the Amount_Input, THE Amount_Input SHALL continue to behave as it does today with no change in formatting or validation.
3. WHEN the evaluated result contains more decimal places than the currency allows, THE Amount_Input SHALL round the result to the currency's `decimal_digits` using the locale-standard rounding provided by `Intl.NumberFormat`.

### Requirement 2: Expression Evaluation on Submit

**User Story:** As a user, I want the system to evaluate any unevaluated expression in the amount field when I submit the form, so that an expression left in the field does not block saving.

#### Acceptance Criteria

1. WHEN the user submits the expense or payment form and the amount field contains a valid Arithmetic_Expression that has not yet been evaluated, THE Amount_Schema SHALL evaluate the expression and use the resulting numeric value for validation and persistence.
2. WHEN the evaluated numeric result passes all existing amount constraints (non-zero, within maximum), THE form SHALL proceed with saving using the evaluated value.

### Requirement 3: Supported Operators and Syntax

**User Story:** As a user, I want to use common arithmetic operators and parentheses in the amount field, so that I can express calculations naturally.

#### Acceptance Criteria

1. THE Expression_Evaluator SHALL support the binary operators addition (`+`), subtraction (`-`), multiplication (`*`), and division (`/`).
2. THE Expression_Evaluator SHALL support parentheses `(` and `)` for explicit grouping of sub-expressions.
3. THE Expression_Evaluator SHALL respect standard operator precedence: multiplication and division before addition and subtraction, with parentheses overriding precedence.
4. THE Expression_Evaluator SHALL support unary minus for negative numbers at the start of an expression or after an opening parenthesis (e.g. `-5+3`, `(-5+3)`).
5. THE Expression_Evaluator SHALL reject any characters outside the set: digits (`0-9`), decimal separator (`.` or `,`), operators (`+`, `-`, `*`, `/`), parentheses (`(`, `)`), and whitespace.

### Requirement 4: Locale-Aware Decimal Separators

**User Story:** As a user in a locale that uses comma as a decimal separator, I want the expression evaluator to correctly interpret my input, so that `10,50+2,25` evaluates to `12.75`.

#### Acceptance Criteria

1. THE Expression_Evaluator SHALL accept both `.` and `,` as decimal separators in numeric literals within expressions.
2. WHEN the expression contains commas used as decimal separators, THE Expression_Evaluator SHALL interpret each comma as a decimal point for the immediately surrounding digits.
3. THE Expression_Evaluator SHALL NOT interpret a comma as a thousands separator; each comma is treated as a decimal separator.

### Requirement 5: Invalid Expression Handling

**User Story:** As a user, I want clear feedback when I enter a malformed expression, so that I know what to fix before the form can be submitted.

#### Acceptance Criteria

1. IF the Amount_Input contains an Arithmetic_Expression with syntax errors (unbalanced parentheses, consecutive operators, trailing operators, empty parentheses), THEN THE Amount_Input SHALL display a validation error message indicating the expression is invalid.
2. IF the Amount_Input contains an invalid expression on form submission, THEN THE Amount_Schema SHALL reject the value and block form submission.
3. IF an Arithmetic_Expression produces a division by zero, THEN THE Expression_Evaluator SHALL treat the expression as invalid and THE Amount_Input SHALL display a validation error.
4. IF an Arithmetic_Expression evaluates to a non-finite number (Infinity, NaN), THEN THE Expression_Evaluator SHALL treat the expression as invalid.

### Requirement 6: Expression Evaluator as a Pure Utility

**User Story:** As a developer, I want the expression evaluator to be a standalone pure function with no side effects, so that it is easy to test with property-based tests and reuse across the codebase.

#### Acceptance Criteria

1. THE Expression_Evaluator SHALL be implemented as a pure function that takes a string input and returns either a numeric result or an error indicator.
2. THE Expression_Evaluator SHALL not depend on DOM APIs, React state, or any external service.
3. THE Expression_Evaluator SHALL include a pretty-printer function that formats a parsed expression tree back into a canonical string representation.
4. FOR ALL valid Arithmetic_Expressions, parsing then pretty-printing then parsing SHALL produce an equivalent expression tree (round-trip property).

### Requirement 7: Integration with Expense and Payment Forms

**User Story:** As a user, I want expression evaluation to work in both the expense form and the payment form amount fields, so that I have a consistent experience across the app.

#### Acceptance Criteria

1. WHEN the user enters an Arithmetic_Expression in the expense form amount field, THE Amount_Input SHALL evaluate the expression following the same rules as described in Requirement 1.
2. WHEN the user enters an Arithmetic_Expression in the payment form amount field, THE Amount_Input SHALL evaluate the expression following the same rules as described in Requirement 1.
3. THE Amount_Input SHALL preserve the existing currency symbol prefix, currency selector, and input group styling while supporting expressions.
4. WHILE the user is actively typing an expression (field is focused), THE Amount_Input SHALL display the raw expression text without attempting evaluation.

### Requirement 8: Input Affordance

**User Story:** As a user, I want a visual hint that the amount field supports expressions, so that I can discover this feature without documentation.

#### Acceptance Criteria

1. THE Amount_Input SHALL update its placeholder text to hint at expression support (e.g. `0.00 or 10+5`).
2. THE Amount_Input SHALL change its `inputMode` from `decimal` to `text` to allow entry of operator characters on mobile keyboards.
