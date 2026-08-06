import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { CurrencyAmountInput } from '../currency-amount-input'

import type { Currency } from '@/lib/currency'

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      expressionHint: 'or 10+5',
    }
    return messages[key] ?? key
  },
}))

const usdCurrency: Currency = {
  code: 'USD',
  name: 'US Dollar',
  name_plural: 'US dollars',
  symbol: '$',
  symbol_native: '$',
  decimal_digits: 2,
  rounding: 0,
}

const defaultProps = {
  value: undefined as number | string | undefined | null,
  onValueChange: jest.fn(),
  currency: usdCurrency,
  locale: 'en-US',
}

describe('CurrencyAmountInput — expression behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Validates: Requirement 8.2
   */
  it('sets inputMode to "text"', () => {
    render(<CurrencyAmountInput {...defaultProps} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('inputmode', 'text')
  })

  /**
   * Validates: Requirement 8.1
   */
  it('placeholder includes expression hint text', () => {
    render(<CurrencyAmountInput {...defaultProps} />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute(
      'placeholder',
      expect.stringContaining('or 10+5'),
    )
  })

  /**
   * Validates: Requirements 1.1, 7.4
   */
  it('onBlur with a valid expression calls onValueChange with evaluated numeric result', () => {
    const onValueChange = jest.fn()
    render(
      <CurrencyAmountInput {...defaultProps} onValueChange={onValueChange} />,
    )

    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '10+5' } })
    fireEvent.blur(input)

    // The last call to onValueChange on blur should be the evaluated result
    const calls = onValueChange.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0]).toBe('15')
  })

  /**
   * Validates: Requirements 1.1, 5.1
   */
  it('onBlur with an invalid expression propagates the raw string', () => {
    const onValueChange = jest.fn()
    render(
      <CurrencyAmountInput {...defaultProps} onValueChange={onValueChange} />,
    )

    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '10+' } })
    fireEvent.blur(input)

    // On blur with invalid expression, the raw draft is propagated
    const calls = onValueChange.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0]).toBe('10+')
  })

  /**
   * Validates: Requirement 7.4
   */
  it('focused state shows raw draft without evaluation', () => {
    render(<CurrencyAmountInput {...defaultProps} />)

    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '10+5' } })

    // While focused, input shows raw expression, not evaluated result
    expect(input.value).toBe('10+5')
  })

  /**
   * Validates: Requirement 1.2
   */
  it('plain numbers continue to work as before (no regression)', () => {
    const onValueChange = jest.fn()
    render(
      <CurrencyAmountInput {...defaultProps} onValueChange={onValueChange} />,
    )

    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '42.50' } })
    fireEvent.blur(input)

    // Plain number is not an expression, so onChange propagated it directly.
    // On blur, isExpression('42.50') is false, so no expression evaluation occurs.
    // The onValueChange from onChange should have been called with the plain number.
    expect(onValueChange).toHaveBeenCalledWith('42.50')
  })
})
