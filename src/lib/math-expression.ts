// --- AST Types ---

export type NumberNode = { type: 'number'; value: number }
export type UnaryNode = { type: 'unary'; operator: '-'; operand: ExprNode }
export type BinaryNode = {
  type: 'binary'
  operator: '+' | '-' | '*' | '/'
  left: ExprNode
  right: ExprNode
}
export type ExprNode = NumberNode | UnaryNode | BinaryNode

// --- Result Types ---

export type EvalSuccess = { ok: true; value: number }
export type EvalError = { ok: false; error: string }
export type EvalResult = EvalSuccess | EvalError

// --- Token Types ---

type TokenKind = 'number' | 'operator' | 'lparen' | 'rparen'
type Token = { kind: TokenKind; value: string }

// --- Allowed characters regex ---

const ALLOWED_CHARS = /^[\d.,+\-*/() ]*$/

// --- Tokenizer ---

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    // Skip whitespace
    if (ch === ' ') {
      i++
      continue
    }

    // Number: digits, possibly with one decimal separator (. or ,)
    if (ch >= '0' && ch <= '9') {
      let num = ''
      let hasDecimal = false
      while (i < input.length) {
        const c = input[i]
        if (c >= '0' && c <= '9') {
          num += c
          i++
        } else if ((c === '.' || c === ',') && !hasDecimal) {
          // Look ahead to ensure there's at least one digit after the separator
          if (
            i + 1 < input.length &&
            input[i + 1] >= '0' &&
            input[i + 1] <= '9'
          ) {
            hasDecimal = true
            num += '.'
            i++
          } else {
            break
          }
        } else {
          break
        }
      }
      tokens.push({ kind: 'number', value: num })
      continue
    }

    // Decimal separator at start (e.g., ".5" or ",5")
    if (
      (ch === '.' || ch === ',') &&
      i + 1 < input.length &&
      input[i + 1] >= '0' &&
      input[i + 1] <= '9'
    ) {
      let num = '0.'
      i++ // skip the separator
      while (i < input.length && input[i] >= '0' && input[i] <= '9') {
        num += input[i]
        i++
      }
      tokens.push({ kind: 'number', value: num })
      continue
    }

    // Operators
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'operator', value: ch })
      i++
      continue
    }

    // Parentheses
    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: '(' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')' })
      i++
      continue
    }

    // Invalid character
    return null
  }

  return tokens
}

// --- Recursive-Descent Parser ---

type ParseSuccess = { ok: true; ast: ExprNode }
type ParseError = { ok: false; error: string }
type ParseResult = ParseSuccess | ParseError

/**
 * Parse an expression string into an AST.
 * Returns the AST or an error.
 */
export function parse(input: string): ParseResult {
  // Validate allowed characters
  if (!ALLOWED_CHARS.test(input)) {
    return { ok: false, error: 'Invalid characters in expression' }
  }

  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Empty expression' }
  }

  const tokenized = tokenize(trimmed)
  if (tokenized === null) {
    return { ok: false, error: 'Invalid characters in expression' }
  }
  if (tokenized.length === 0) {
    return { ok: false, error: 'Empty expression' }
  }

  const tokens: Token[] = tokenized
  let pos = 0

  function peek(): Token | undefined {
    return tokens[pos]
  }

  function advance(): Token {
    return tokens[pos++]
  }

  // Expression = Term (('+' | '-') Term)*
  function parseExpression(): ExprNode | null {
    let left = parseTerm()
    if (left === null) return null

    while (
      peek() &&
      peek()!.kind === 'operator' &&
      (peek()!.value === '+' || peek()!.value === '-')
    ) {
      const op = advance().value as '+' | '-'
      const right = parseTerm()
      if (right === null) return null
      left = { type: 'binary', operator: op, left, right }
    }

    return left
  }

  // Term = Factor (('*' | '/') Factor)*
  function parseTerm(): ExprNode | null {
    let left = parseFactor()
    if (left === null) return null

    while (
      peek() &&
      peek()!.kind === 'operator' &&
      (peek()!.value === '*' || peek()!.value === '/')
    ) {
      const op = advance().value as '*' | '/'
      const right = parseFactor()
      if (right === null) return null
      left = { type: 'binary', operator: op, left, right }
    }

    return left
  }

  // Factor = '-' Factor | Atom
  function parseFactor(): ExprNode | null {
    if (peek() && peek()!.kind === 'operator' && peek()!.value === '-') {
      advance() // consume '-'
      const operand = parseFactor()
      if (operand === null) return null
      return { type: 'unary', operator: '-', operand }
    }
    return parseAtom()
  }

  // Atom = '(' Expression ')' | Number
  function parseAtom(): ExprNode | null {
    const token = peek()
    if (!token) return null

    if (token.kind === 'lparen') {
      advance() // consume '('
      const expr = parseExpression()
      if (expr === null) return null
      const closing = peek()
      if (!closing || closing.kind !== 'rparen') {
        return null // unbalanced parenthesis
      }
      advance() // consume ')'
      return expr
    }

    if (token.kind === 'number') {
      advance()
      const value = parseFloat(token.value)
      return { type: 'number', value }
    }

    return null
  }

  const ast = parseExpression()
  if (ast === null) {
    return { ok: false, error: 'Syntax error in expression' }
  }

  // Ensure all tokens were consumed
  if (pos < tokens.length) {
    return { ok: false, error: 'Unexpected token after expression' }
  }

  return { ok: true, ast }
}

// --- Evaluator ---

function evalNode(node: ExprNode): number {
  switch (node.type) {
    case 'number':
      return node.value
    case 'unary':
      return -evalNode(node.operand)
    case 'binary': {
      const left = evalNode(node.left)
      const right = evalNode(node.right)
      switch (node.operator) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
      }
    }
  }
}

/** Evaluate an arithmetic expression string to a numeric result. */
export function evaluate(input: string): EvalResult {
  const result = parse(input)
  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  const value = evalNode(result.ast)

  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Result is not finite' }
  }

  return { ok: true, value }
}

// --- Pretty Printer ---

function precedence(op: '+' | '-' | '*' | '/'): number {
  switch (op) {
    case '+':
    case '-':
      return 1
    case '*':
    case '/':
      return 2
  }
}

function prettyPrintNode(
  node: ExprNode,
  parentOp?: '+' | '-' | '*' | '/',
  isRight?: boolean,
): string {
  switch (node.type) {
    case 'number':
      // Format number: use integer when possible, otherwise trim trailing zeros
      if (Number.isInteger(node.value)) {
        return node.value.toString()
      }
      return node.value.toString()

    case 'unary': {
      const operandStr = prettyPrintNode(node.operand)
      // If operand is a binary expression, wrap it in parens to preserve semantics
      if (node.operand.type === 'binary') {
        return `(-(${operandStr}))`
      }
      return `(-${operandStr})`
    }

    case 'binary': {
      const left = prettyPrintNode(node.left, node.operator, false)
      const right = prettyPrintNode(node.right, node.operator, true)
      const expr = `${left} ${node.operator} ${right}`

      if (parentOp === undefined) {
        return expr
      }

      const parentPrec = precedence(parentOp)
      const currentPrec = precedence(node.operator)

      // Need parens if current precedence is lower than parent
      if (currentPrec < parentPrec) {
        return `(${expr})`
      }

      // For right-associativity: a - (b - c) and a / (b / c) need parens
      if (
        isRight &&
        currentPrec === parentPrec &&
        (parentOp === '-' || parentOp === '/')
      ) {
        return `(${expr})`
      }

      return expr
    }
  }
}

/**
 * Pretty-print an AST back into a canonical expression string.
 * Uses minimal parentheses based on operator precedence.
 */
export function prettyPrint(node: ExprNode): string {
  return prettyPrintNode(node)
}

// --- isExpression ---

/**
 * Check if a string contains any arithmetic operators,
 * indicating it's an expression rather than a plain number.
 * Excludes a leading unary minus from triggering expression detection.
 */
export function isExpression(input: string): boolean {
  // Strip leading whitespace and optional leading minus
  const stripped = input.replace(/^\s*-?\s*/, '')
  // Check for operator characters or parentheses in the remaining string
  return /[+\-*/()]/.test(stripped)
}
