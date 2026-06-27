import { getBalances, getSuggestedReimbursements } from '@/lib/balances'
import { getCurrency } from '@/lib/currency'
import {
  buildPaymentCreatePrefill,
  buildSettlementFormValues,
  findDebtBetween,
  findMatchingReimbursement,
  getSettlementBalanceStatus,
} from '@/lib/settlements'

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-id',
}))

describe('findDebtBetween', () => {
  const suggestions = [
    { from: 'ana', to: 'rafael', amount: 5000 },
    { from: 'bruno', to: 'rafael', amount: 2500 },
  ]

  it('returns the debt edge regardless of amount', () => {
    expect(findDebtBetween(suggestions, 'ana', 'rafael')).toEqual(
      suggestions[0],
    )
  })

  it('returns undefined when no debt exists', () => {
    expect(findDebtBetween(suggestions, 'rafael', 'ana')).toBeUndefined()
  })
})

describe('findMatchingReimbursement', () => {
  const suggestions = [
    { from: 'ana', to: 'rafael', amount: 5000 },
    { from: 'bruno', to: 'rafael', amount: 2500 },
  ]

  it('returns a matching suggestion', () => {
    expect(
      findMatchingReimbursement(suggestions, 'ana', 'rafael', 5000),
    ).toEqual(suggestions[0])
  })

  it('returns undefined when amount differs', () => {
    expect(
      findMatchingReimbursement(suggestions, 'ana', 'rafael', 4999),
    ).toBeUndefined()
  })
})

describe('getSettlementBalanceStatus', () => {
  const suggestions = [
    { from: 'ana', to: 'rafael', amount: 2500 },
    { from: 'bruno', to: 'rafael', amount: 1000 },
  ]

  it('reports remaining debt from payer to creditor', () => {
    expect(getSettlementBalanceStatus(suggestions, 'ana', 'rafael')).toEqual({
      kind: 'payer_owes_creditor',
      amount: 2500,
    })
  })

  it('reports when creditor owes payer', () => {
    expect(getSettlementBalanceStatus(suggestions, 'rafael', 'ana')).toEqual({
      kind: 'creditor_owes_payer',
      amount: 2500,
    })
  })

  it('reports settled when no debt remains between them', () => {
    expect(getSettlementBalanceStatus([], 'ana', 'rafael')).toEqual({
      kind: 'settled',
    })
  })
})

describe('buildSettlementFormValues', () => {
  it('settles balances when recorded', () => {
    const expenses = [
      {
        amount: 10000,
        isReimbursement: false,
        splitMode: 'EVENLY' as const,
        paidBy: { id: 'rafael', name: 'Rafael' },
        paidFor: [
          { user: { id: 'rafael', name: 'Rafael' }, shares: 1 },
          { user: { id: 'ana', name: 'Ana' }, shares: 1 },
        ],
      },
    ]

    const before = getSuggestedReimbursements(getBalances(expenses as any))
    expect(before).toEqual([{ from: 'ana', to: 'rafael', amount: 5000 }])

    const settlement = buildSettlementFormValues(
      5000,
      'ana',
      'rafael',
      'Settlement',
    )

    // Ana/Rafael €25 bug fix: paidFor must only contain the creditor, not both participants
    expect(settlement.paidFor).toHaveLength(1)
    expect(settlement.paidFor[0].participant).toBe('rafael')
    expect(settlement.paidFor[0].shares).toBe(5000)

    const balances = getBalances([
      ...expenses,
      {
        amount: settlement.amount,
        isReimbursement: true,
        splitMode: settlement.splitMode,
        paidBy: { id: settlement.paidBy, name: 'Ana' },
        paidFor: settlement.paidFor.map((pf) => ({
          user: { id: pf.participant, name: pf.participant },
          shares: pf.shares,
        })),
      },
    ] as any)

    expect(getSuggestedReimbursements(balances)).toEqual([])
  })

  it('supports partial settlements', () => {
    const expenses = [
      {
        amount: 10000,
        isReimbursement: false,
        splitMode: 'EVENLY' as const,
        paidBy: { id: 'rafael', name: 'Rafael' },
        paidFor: [
          { user: { id: 'rafael', name: 'Rafael' }, shares: 1 },
          { user: { id: 'ana', name: 'Ana' }, shares: 1 },
        ],
      },
    ]

    const partialSettlement = buildSettlementFormValues(
      2500,
      'ana',
      'rafael',
      'Partial settlement',
    )

    const balances = getBalances([
      ...expenses,
      {
        amount: partialSettlement.amount,
        isReimbursement: true,
        splitMode: partialSettlement.splitMode,
        paidBy: { id: partialSettlement.paidBy, name: 'Ana' },
        paidFor: partialSettlement.paidFor.map((pf) => ({
          user: { id: pf.participant, name: pf.participant },
          shares: pf.shares,
        })),
      },
    ] as any)

    expect(getSuggestedReimbursements(balances)).toEqual([
      { from: 'ana', to: 'rafael', amount: 2500 },
    ])
  })
})

describe('buildPaymentCreatePrefill', () => {
  it('prefills payment fields with major-unit amounts for the expense form', () => {
    const currency = getCurrency('EUR')
    const prefill = buildPaymentCreatePrefill(
      3333,
      'friend-id',
      'me-id',
      currency,
    )

    expect(prefill.isReimbursement).toBe(true)
    expect(prefill.paidBy).toBe('friend-id')
    expect(prefill.paidFor).toEqual([{ participant: 'me-id', shares: 33.33 }])
    expect(prefill.amount).toBe(33.33)
    expect(prefill.splitMode).toBe('BY_AMOUNT')
    expect(prefill.category).toBe(1)
  })
})
