import { convertAmount, getDecimalDigits } from '@/lib/currency-conversion'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import fc from 'fast-check'

const mockFetchRate = jest.fn()

jest.mock('@/lib/currency-conversion', () => {
  const actual = jest.requireActual('@/lib/currency-conversion')
  return {
    ...actual,
    fetchRate: (...args: unknown[]) => mockFetchRate(...args),
  }
})

import { resolveConversion } from '../resolve-conversion'

describe('resolveConversion', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('uses fetched rate and computes correct converted amount', async () => {
    mockFetchRate.mockResolvedValue({
      ok: true,
      rate: 0.92,
      date: '2024-01-15',
    })

    const result = await resolveConversion({
      originalAmount: 15000,
      originalCurrency: 'USD',
      groupCurrencyCode: 'EUR',
      expenseDate: new Date('2024-01-15'),
    })

    const expectedAmount = convertAmount(
      15000,
      0.92,
      getDecimalDigits('USD'),
      getDecimalDigits('EUR'),
    )

    expect(result.amount).toBe(expectedAmount)
    expect(result.amount).toBe(13800)
    expect(result.originalAmount).toBe(15000)
    expect(result.originalCurrency).toBe('USD')
    expect(result.conversionRate).toEqual(new Prisma.Decimal(0.92))
  })

  it('uses client fallback rate when fetchRate fails', async () => {
    mockFetchRate.mockResolvedValue({
      ok: false,
      reason: 'network',
      message: 'timeout',
    })

    const result = await resolveConversion({
      originalAmount: 15000,
      originalCurrency: 'USD',
      groupCurrencyCode: 'EUR',
      expenseDate: new Date('2024-01-15'),
      clientConversionRate: 0.9,
    })

    const expectedAmount = convertAmount(
      15000,
      0.9,
      getDecimalDigits('USD'),
      getDecimalDigits('EUR'),
    )

    expect(result.amount).toBe(expectedAmount)
    expect(result.originalAmount).toBe(15000)
    expect(result.originalCurrency).toBe('USD')
    expect(result.conversionRate).toEqual(new Prisma.Decimal(0.9))
  })

  it('throws TRPCError PRECONDITION_FAILED when fetchRate fails and no fallback', async () => {
    mockFetchRate.mockResolvedValue({
      ok: false,
      reason: 'network',
      message: 'timeout',
    })

    await expect(
      resolveConversion({
        originalAmount: 15000,
        originalCurrency: 'USD',
        groupCurrencyCode: 'EUR',
        expenseDate: new Date('2024-01-15'),
        clientConversionRate: undefined,
      }),
    ).rejects.toThrow(TRPCError)

    await expect(
      resolveConversion({
        originalAmount: 15000,
        originalCurrency: 'USD',
        groupCurrencyCode: 'EUR',
        expenseDate: new Date('2024-01-15'),
      }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('returns passthrough when originalCurrency equals groupCurrencyCode', async () => {
    const result = await resolveConversion({
      originalAmount: 5000,
      originalCurrency: 'EUR',
      groupCurrencyCode: 'EUR',
      expenseDate: new Date(),
    })

    expect(result.amount).toBe(5000)
    expect(result.originalAmount).toBeNull()
    expect(result.originalCurrency).toBeNull()
    expect(result.conversionRate).toBeNull()
    expect(mockFetchRate).not.toHaveBeenCalled()
  })

  it('returns passthrough when originalCurrency is null', async () => {
    const result = await resolveConversion({
      originalAmount: 5000,
      originalCurrency: null,
      groupCurrencyCode: 'EUR',
      expenseDate: new Date(),
    })

    expect(result.amount).toBe(5000)
    expect(result.originalAmount).toBeNull()
    expect(result.originalCurrency).toBeNull()
    expect(result.conversionRate).toBeNull()
    expect(mockFetchRate).not.toHaveBeenCalled()
  })

  it('returns passthrough when originalCurrency is empty string', async () => {
    const result = await resolveConversion({
      originalAmount: 5000,
      originalCurrency: '',
      groupCurrencyCode: 'EUR',
      expenseDate: new Date(),
    })

    expect(result.amount).toBe(5000)
    expect(result.originalAmount).toBeNull()
    expect(result.originalCurrency).toBeNull()
    expect(result.conversionRate).toBeNull()
    expect(mockFetchRate).not.toHaveBeenCalled()
  })

  // Feature: server-authoritative-currency-conversion, Property 4: Server-authoritative conversion overrides client amount
  // **Validates: Requirements 4.4, 1.2, 1.3**
  it('Property 4: server-authoritative conversion always computes amount from originalAmount and fetched rate', async () => {
    const originalCurrencies = ['USD', 'GBP', 'JPY', 'CAD', 'AUD'] as const
    const groupCurrency = 'EUR'

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000_00 }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        fc.constantFrom(...originalCurrencies),
        async (originalAmount, rate, originalCurrency) => {
          mockFetchRate.mockResolvedValue({
            ok: true,
            rate,
            date: '2024-01-15',
          })

          const result = await resolveConversion({
            originalAmount,
            originalCurrency,
            groupCurrencyCode: groupCurrency,
            expenseDate: new Date('2024-01-15'),
          })

          const expectedAmount = convertAmount(
            originalAmount,
            rate,
            getDecimalDigits(originalCurrency),
            getDecimalDigits(groupCurrency),
          )

          expect(result.amount).toBe(expectedAmount)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// Feature: server-authoritative-currency-conversion, Property 3: Same-currency passthrough nullifies conversion fields
// **Validates: Requirements 1.4**
describe('Property 3: Same-currency passthrough nullifies conversion fields', () => {
  const CURRENCIES = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CAD',
    'AUD',
    'CHF',
    'KRW',
    'ISK',
    'HUF',
    'BRL',
    'MXN',
  ] as const

  const currencyArb = fc.constantFrom(...CURRENCIES)
  const amountArb = fc.integer({ min: 1, max: 1_000_000_00 })

  it('returns null conversion fields and unchanged amount when originalCurrency === groupCurrency', async () => {
    await fc.assert(
      fc.asyncProperty(currencyArb, amountArb, async (currency, amount) => {
        const result = await resolveConversion({
          originalAmount: amount,
          originalCurrency: currency,
          groupCurrencyCode: currency,
          expenseDate: new Date('2024-06-15'),
        })

        expect(result.originalAmount).toBeNull()
        expect(result.originalCurrency).toBeNull()
        expect(result.conversionRate).toBeNull()
        expect(result.amount).toBe(amount)
      }),
      { numRuns: 100 },
    )
  })
})
