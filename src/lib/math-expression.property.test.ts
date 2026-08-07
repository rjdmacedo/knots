import type { ExprNode } from '@/lib/math-expression'
import { evaluate, parse, prettyPrint } from '@/lib/math-expression'
import { expenseFormSchema } from '@/lib/schemas'
import fc from 'fast-check'

/**
 * Property-based tests for the math expression evaluator.
 *
 * Feature: expense-amount-math-expressions
 *
 * Validates: Requirements 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 6.3, 6.4
 */

// --- Generators ---

function arbExprNode(maxDepth: number): fc.Arbitrary<ExprNode> {
  const arbNumber = fc
    .double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true })
    .map((v) => Math.round(v * 100) / 100)
    .map((value): ExprNode => ({ type: 'number', value }))

  if (maxDepth <= 0) return arbNumber

  const arbOperator = fc.constantFrom('+', '-', '*', '/') as fc.Arbitrary<
    '+' | '-' | '*' | '/'
  >

  const arbBinary = fc
    .tuple(arbExprNode(maxDepth - 1), arbOperator, arbExprNode(maxDepth - 1))
    .filter(([_, op, right]) => {
      if (op === '/') {
        if (right.type === 'number') return right.value !== 0
      }
      return true
    })
    .map(
      ([left, operator, right]): ExprNode => ({
        type: 'binary',
        operator,
        left,
        right,
      }),
    )

  const arbUnary = arbExprNode(maxDepth - 1).map(
    (operand): ExprNode => ({ type: 'unary', operator: '-', operand }),
  )

  return fc.oneof(
    { weight: 3, arbitrary: arbNumber },
    { weight: 4, arbitrary: arbBinary },
    { weight: 1, arbitrary: arbUnary },
  )
}

// --- Reference evaluator ---

function referenceEval(node: ExprNode): number {
  switch (node.type) {
    case 'number':
      return node.value
    case 'unary':
      return -referenceEval(node.operand)
    case 'binary': {
      const l = referenceEval(node.left)
      const r = referenceEval(node.right)
      switch (node.operator) {
        case '+':
          return l + r
        case '-':
          return l - r
        case '*':
          return l * r
        case '/':
          return l / r
      }
    }
  }
}

// --- AST comparison with floating-point tolerance ---

function astEqual(a: ExprNode, b: ExprNode): boolean {
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'number':
      return Math.abs(a.value - (b as typeof a).value) < 1e-9
    case 'unary':
      return astEqual(a.operand, (b as typeof a).operand)
    case 'binary': {
      const bb = b as typeof a
      return (
        a.operator === bb.operator &&
        astEqual(a.left, bb.left) &&
        astEqual(a.right, bb.right)
      )
    }
  }
}

// --- Property Tests ---

describe('Feature: expense-amount-math-expressions, Property 1: Evaluator Arithmetic Correctness', () => {
  /**
   * Validates: Requirements 1.2, 3.1, 3.2, 3.3, 3.4
   *
   * For any valid AST (depth ≤ 4), prettyPrint to string then evaluate should
   * produce a result equal to the reference JS computation on the AST
   * (within floating-point tolerance).
   */
  it('evaluate(prettyPrint(ast)) equals reference JS computation for random ASTs', () => {
    fc.assert(
      fc.property(arbExprNode(4), (ast) => {
        const ref = referenceEval(ast)

        // Skip non-finite reference results (division by zero in subtrees)
        if (!Number.isFinite(ref)) return true

        const printed = prettyPrint(ast)
        const result = evaluate(printed)

        if (!result.ok) {
          // If evaluator rejects, it should only be for non-finite results
          // which we already filtered above, so this is unexpected
          return false
        }

        // Compare with relative tolerance for floating-point
        if (Math.abs(ref) < 1e-10) {
          return Math.abs(result.value - ref) < 1e-6
        }
        return Math.abs((result.value - ref) / ref) < 1e-9
      }),
      { numRuns: 200 },
    )
  })
})

describe('Feature: expense-amount-math-expressions, Property 2: Parse/Print Round-Trip', () => {
  /**
   * Validates: Requirements 6.3, 6.4
   *
   * For any valid AST, prettyPrint → parse → prettyPrint should produce the
   * same canonical string (idempotent round-trip). This validates that:
   * 1. prettyPrint always produces parseable output
   * 2. The canonical form is stable (round-tripping converges)
   */
  it('prettyPrint(parse(prettyPrint(ast))) equals prettyPrint(ast) — canonical form is idempotent', () => {
    fc.assert(
      fc.property(arbExprNode(4), (ast) => {
        const printed = prettyPrint(ast)
        const parsed = parse(printed)

        if (!parsed.ok) {
          // prettyPrint should always produce parseable output
          return false
        }

        const reprinted = prettyPrint(parsed.ast)

        // The canonical form should be stable: re-printing the parsed AST
        // should give the same string
        return printed === reprinted
      }),
      { numRuns: 200 },
    )
  })

  /**
   * Validates: Requirements 6.3, 6.4
   *
   * For any valid AST, prettyPrint → parse → evaluate should give the same
   * numeric result as directly evaluating the original AST. This ensures
   * the round-trip preserves semantics.
   */
  it('parse(prettyPrint(ast)) preserves evaluation semantics', () => {
    fc.assert(
      fc.property(arbExprNode(4), (ast) => {
        const ref = referenceEval(ast)
        if (!Number.isFinite(ref)) return true

        const printed = prettyPrint(ast)
        const parsed = parse(printed)

        if (!parsed.ok) return false

        const parsedRef = referenceEval(parsed.ast)

        if (Math.abs(ref) < 1e-10) {
          return Math.abs(parsedRef - ref) < 1e-6
        }
        return Math.abs((parsedRef - ref) / ref) < 1e-9
      }),
      { numRuns: 200 },
    )
  })
})

describe('Feature: expense-amount-math-expressions, Property 3: Locale Decimal Equivalence', () => {
  /**
   * Validates: Requirements 4.1, 4.2
   *
   * For any expression with `.` decimal separators, replacing `.` with `,`
   * in numeric literals should produce the same evaluation result.
   */
  it('expressions with comma decimals evaluate the same as dot decimals', () => {
    fc.assert(
      fc.property(arbExprNode(3), (ast) => {
        const printed = prettyPrint(ast)

        // Only test if the expression contains decimal points
        if (!printed.includes('.')) return true

        // Replace dots in numeric literals with commas
        // Dots only appear in numeric literals in prettyPrint output
        const commaVariant = printed.replace(/(\d)\.(\d)/g, '$1,$2')

        const dotResult = evaluate(printed)
        const commaResult = evaluate(commaVariant)

        if (!dotResult.ok || !commaResult.ok) {
          // Both should either succeed or fail
          return dotResult.ok === commaResult.ok
        }

        // Results should be equal
        if (Math.abs(dotResult.value) < 1e-10) {
          return Math.abs(dotResult.value - commaResult.value) < 1e-6
        }
        return (
          Math.abs((dotResult.value - commaResult.value) / dotResult.value) <
          1e-9
        )
      }),
      { numRuns: 200 },
    )
  })
})

describe('Feature: expense-amount-math-expressions, Property 4: Invalid Input Rejection', () => {
  /**
   * Validates: Requirements 3.5, 5.1, 5.2, 5.3, 5.4
   *
   * Strings with invalid characters or structurally invalid expressions
   * should always be rejected by evaluate.
   */
  it('strings with invalid characters are rejected', () => {
    const invalidChar = fc.constantFrom(
      '@',
      '#',
      '$',
      '!',
      '&',
      '=',
      '?',
      'a',
      'b',
      'c',
      'x',
      'y',
      'z',
      'A',
      'B',
      'C',
    )

    // Mix invalid chars with valid expression parts
    const invalidInput = fc
      .tuple(
        fc.constantFrom('1', '2+3', '10*5', '(4+2)'),
        fc.array(invalidChar, { minLength: 1, maxLength: 10 }),
      )
      .map(([valid, chars]) => valid + chars.join(''))

    fc.assert(
      fc.property(invalidInput, (input) => {
        const result = evaluate(input)
        return !result.ok
      }),
      { numRuns: 200 },
    )
  })

  it('structurally invalid expressions are rejected', () => {
    const structurallyInvalid = fc.constantFrom(
      // Unbalanced parentheses
      '(5+3',
      '5+3)',
      '((5+3)',
      '(5+3))',
      '(((1+2)',
      // Trailing operators
      '5+',
      '3-',
      '10*',
      '7/',
      '1+2+',
      // Empty parentheses
      '()',
      '1+()',
      '()+2',
      // Consecutive operators (non-unary)
      '5**3',
      '5//3',
      '5*/3',
      '5/*3',
      // Leading non-unary operators
      '*5',
      '/5',
      '+',
      '*',
      '/',
      // Just operators
      '+-',
      '++',
      // Division by zero
      '10/0',
      '5/(3-3)',
      '100/(0)',
    )

    fc.assert(
      fc.property(structurallyInvalid, (input) => {
        const result = evaluate(input)
        return !result.ok
      }),
      { numRuns: 200 },
    )
  })
})

describe('Feature: expense-amount-math-expressions, Property 5: Schema Expression Evaluation Consistency', () => {
  /**
   * Validates: Requirements 2.1, 2.2
   *
   * For any valid expression string, passing it through the Zod amount schema
   * transform should produce a numeric value equal to evaluate(expr).value.
   */
  it('Zod amount schema produces the same result as direct evaluate() for valid expressions', () => {
    fc.assert(
      fc.property(arbExprNode(3), (ast) => {
        const ref = referenceEval(ast)
        if (!Number.isFinite(ref)) return true
        if (ref === 0) return true // skip zero since schema rejects it (amountNotZero)
        if (ref < 0) return true // skip negative since paymentAmountSchema rejects it
        if (ref > 10_000_000_00) return true // skip amounts exceeding max

        const printed = prettyPrint(ast)
        const evalResult = evaluate(printed)
        if (!evalResult.ok) return true // skip if evaluator rejects (shouldn't happen for valid ASTs)

        // Parse through the expense form schema's amount field
        const schemaResult = expenseFormSchema.safeParse({
          expenseDate: new Date(),
          title: 'Test',
          category: 0,
          amount: printed,
          paidBy: [{ participant: 'user1', amount: evalResult.value }],
          paidFor: [{ participant: 'user2', shares: '100' }],
          splitMode: 'EVENLY',
          saveDefaultSplittingOptions: false,
          saveDefaultPaidByOptions: false,
          isReimbursement: false,
        })

        if (!schemaResult.success) {
          // Schema rejected a valid expression — this is a failure
          return false
        }

        // Compare amount from schema output to direct evaluate result
        const schemaAmount = schemaResult.data.amount
        if (Math.abs(evalResult.value) < 1e-10) {
          return Math.abs(schemaAmount - evalResult.value) < 1e-6
        }
        return (
          Math.abs((schemaAmount - evalResult.value) / evalResult.value) < 1e-9
        )
      }),
      { numRuns: 200 },
    )
  })
})
