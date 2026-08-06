import type { EvalSuccess } from '@/lib/math-expression'
import {
  evaluate,
  isExpression,
  parse,
  prettyPrint,
} from '@/lib/math-expression'

describe('math-expression evaluator', () => {
  // --- Basic Arithmetic ---

  describe('basic arithmetic', () => {
    it('evaluates addition with decimals: "12+4.50" → 16.5', () => {
      const result = evaluate('12+4.50')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(16.5)
    })

    it('evaluates division: "100/3" → 33.333...', () => {
      const result = evaluate('100/3')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBeCloseTo(33.3333, 4)
    })

    it('evaluates grouped expression: "(50+25)*2" → 150', () => {
      const result = evaluate('(50+25)*2')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(150)
    })

    it('evaluates subtraction: "10-3" → 7', () => {
      const result = evaluate('10-3')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(7)
    })

    it('evaluates multiplication: "6*7" → 42', () => {
      const result = evaluate('6*7')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(42)
    })
  })

  // --- Unary Minus ---

  describe('unary minus', () => {
    it('evaluates "-5+3" → -2', () => {
      const result = evaluate('-5+3')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(-2)
    })

    it('evaluates "(-5+3)" → -2', () => {
      const result = evaluate('(-5+3)')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(-2)
    })

    it('evaluates double negation: "-(-5)" → 5', () => {
      const result = evaluate('-(-5)')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(5)
    })
  })

  // --- Operator Precedence ---

  describe('operator precedence', () => {
    it('respects multiplication before addition: "2+3*4" → 14', () => {
      const result = evaluate('2+3*4')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(14)
    })

    it('respects parentheses override: "(2+3)*4" → 20', () => {
      const result = evaluate('(2+3)*4')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(20)
    })

    it('respects division before subtraction: "10-6/2" → 7', () => {
      const result = evaluate('10-6/2')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(7)
    })
  })

  // --- Comma Decimals ---

  describe('comma as decimal separator', () => {
    it('evaluates "10,50+2,25" → 12.75', () => {
      const result = evaluate('10,50+2,25')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(12.75)
    })

    it('evaluates "1,5*2" → 3', () => {
      const result = evaluate('1,5*2')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(3)
    })
  })

  // --- Whitespace Handling ---

  describe('whitespace handling', () => {
    it('evaluates " 5 + 3 " → 8', () => {
      const result = evaluate(' 5 + 3 ')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(8)
    })

    it('evaluates expression with various spacing: "  10  *  2  " → 20', () => {
      const result = evaluate('  10  *  2  ')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(20)
    })
  })

  // --- Error Cases ---

  describe('error cases', () => {
    it('returns error for division by zero: "10/0"', () => {
      const result = evaluate('10/0')
      expect(result.ok).toBe(false)
    })

    it('returns error for unbalanced parentheses: "(5+3"', () => {
      const result = evaluate('(5+3')
      expect(result.ok).toBe(false)
    })

    it('returns error for trailing operator: "5+"', () => {
      const result = evaluate('5+')
      expect(result.ok).toBe(false)
    })

    it('returns error for empty parentheses: "()"', () => {
      const result = evaluate('()')
      expect(result.ok).toBe(false)
    })

    it('returns error for consecutive operators: "5++3"', () => {
      const result = evaluate('5++3')
      expect(result.ok).toBe(false)
    })

    it('returns error for invalid characters: "5+abc"', () => {
      const result = evaluate('5+abc')
      expect(result.ok).toBe(false)
    })

    it('returns error for empty input', () => {
      const result = evaluate('')
      expect(result.ok).toBe(false)
    })

    it('returns error for only whitespace', () => {
      const result = evaluate('   ')
      expect(result.ok).toBe(false)
    })
  })

  // --- Edge Cases ---

  describe('edge cases', () => {
    it('handles large numbers: "99999*99999"', () => {
      const result = evaluate('99999*99999')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(9999800001)
    })

    it('handles deeply nested parentheses: "((((1+2))))"', () => {
      const result = evaluate('((((1+2))))')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(3)
    })

    it('passes through a single number: "42"', () => {
      const result = evaluate('42')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBe(42)
    })

    it('passes through a decimal number: "3.14"', () => {
      const result = evaluate('3.14')
      expect(result.ok).toBe(true)
      expect((result as EvalSuccess).value).toBeCloseTo(3.14, 5)
    })
  })

  // --- isExpression ---

  describe('isExpression', () => {
    it('returns true for expressions with operators', () => {
      expect(isExpression('5+3')).toBe(true)
      expect(isExpression('10-2')).toBe(true)
      expect(isExpression('4*5')).toBe(true)
      expect(isExpression('8/2')).toBe(true)
    })

    it('returns true for expressions with parentheses', () => {
      expect(isExpression('(5+3)')).toBe(true)
      expect(isExpression('(10)')).toBe(true)
    })

    it('returns false for plain numbers', () => {
      expect(isExpression('42')).toBe(false)
      expect(isExpression('3.14')).toBe(false)
      expect(isExpression('100')).toBe(false)
    })

    it('returns false for negative numbers (leading unary minus only)', () => {
      expect(isExpression('-5')).toBe(false)
      expect(isExpression('-3.14')).toBe(false)
    })

    it('returns true for negative number in an expression', () => {
      expect(isExpression('-5+3')).toBe(true)
    })
  })

  // --- prettyPrint ---

  describe('prettyPrint', () => {
    it('prints simple addition', () => {
      const result = parse('2+3')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(prettyPrint(result.ast)).toBe('2 + 3')
      }
    })

    it('prints with correct precedence (no unnecessary parens)', () => {
      const result = parse('2+3*4')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(prettyPrint(result.ast)).toBe('2 + 3 * 4')
      }
    })

    it('prints parentheses when needed for precedence override', () => {
      const result = parse('(2+3)*4')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(prettyPrint(result.ast)).toBe('(2 + 3) * 4')
      }
    })

    it('prints unary minus', () => {
      const result = parse('-5+3')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(prettyPrint(result.ast)).toBe('(-5) + 3')
      }
    })

    it('prints nested expression', () => {
      const result = parse('(1+2)*(3+4)')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(prettyPrint(result.ast)).toBe('(1 + 2) * (3 + 4)')
      }
    })
  })
})
