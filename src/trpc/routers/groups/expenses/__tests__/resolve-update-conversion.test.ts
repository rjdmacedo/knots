import { Prisma } from '@prisma/client'
import { resolveUpdateConversion } from '../resolve-update-conversion'

jest.mock('@/lib/currency-conversion', () => {
  const actual = jest.requireActual('@/lib/currency-conversion')
  return {
    ...actual,
    fetchRate: jest.fn(),
  }
})

import { fetchRate } from '@/lib/currency-conversion'

const mockFetchRate = fetchRate as jest.MockedFunction<typeof fetchRate>

describe('resolveUpdateConversion', () => {
  beforeEach(() => {
    mockFetchRate.mockReset()
  })

  const existingExpense = {
    originalAmount: 15000,
    originalCurrency: 'USD',
    expenseDate: new Date('2024-06-15T00:00:00.000Z'),
    amount: 13800,
    conversionRate: new Prisma.Decimal(0.92),
  }

  it('returns null conversion fields for same-currency updates (clears DB)', async () => {
    const result = await resolveUpdateConversion({
      amount: 5000,
      originalAmount: undefined,
      originalCurrency: 'EUR',
      expenseDate: new Date('2024-06-15T00:00:00.000Z'),
      groupCurrencyCode: 'EUR',
      existingExpense,
    })

    expect(result).toEqual({
      amount: 5000,
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    })
    expect(mockFetchRate).not.toHaveBeenCalled()
  })

  it('returns null conversion fields when originalCurrency is cleared', async () => {
    const result = await resolveUpdateConversion({
      amount: 5000,
      originalAmount: undefined,
      originalCurrency: null,
      expenseDate: new Date('2024-06-15T00:00:00.000Z'),
      groupCurrencyCode: 'EUR',
      existingExpense,
    })

    expect(result.originalAmount).toBeNull()
    expect(result.originalCurrency).toBeNull()
    expect(result.conversionRate).toBeNull()
  })

  it('preserves existing conversion when originalAmount/currency/date unchanged', async () => {
    const result = await resolveUpdateConversion({
      amount: 99999, // group-currency preview; ignored for change detection
      originalAmount: 15000,
      originalCurrency: 'USD',
      expenseDate: new Date('2024-06-15T00:00:00.000Z'),
      groupCurrencyCode: 'EUR',
      existingExpense,
    })

    expect(result).toEqual({
      amount: 13800,
      originalAmount: 15000,
      originalCurrency: 'USD',
      conversionRate: 0.92,
    })
    expect(mockFetchRate).not.toHaveBeenCalled()
  })

  it('re-resolves conversion when originalAmount changes', async () => {
    mockFetchRate.mockResolvedValue({
      ok: true,
      rate: 0.9,
      date: '2024-06-14',
    })

    const result = await resolveUpdateConversion({
      amount: 18000,
      originalAmount: 20000,
      originalCurrency: 'USD',
      expenseDate: new Date('2024-06-15T00:00:00.000Z'),
      groupCurrencyCode: 'EUR',
      existingExpense,
    })

    expect(mockFetchRate).toHaveBeenCalled()
    expect(result.originalAmount).toBe(20000)
    expect(result.originalCurrency).toBe('USD')
    expect(result.conversionRate).toBe(0.9)
    expect(result.amount).toBe(18000) // 20000 * 0.9
  })
})
