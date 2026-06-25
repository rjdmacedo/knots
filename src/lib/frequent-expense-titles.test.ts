import { rankFrequentExpenseTitles } from '@/lib/frequent-expense-titles'

describe('rankFrequentExpenseTitles', () => {
  it('returns the most used titles up to the limit', () => {
    const result = rankFrequentExpenseTitles(
      [
        { title: 'Coffee', categoryId: 1 },
        { title: 'coffee', categoryId: 1 },
        { title: 'Rent', categoryId: 2 },
        { title: 'rent', categoryId: 2 },
        { title: 'Groceries', categoryId: 3 },
      ],
      2,
    )

    expect(result).toEqual([
      { title: 'coffee', categoryId: 1 },
      { title: 'rent', categoryId: 2 },
    ])
  })

  it('ignores titles shorter than two characters after normalization', () => {
    const result = rankFrequentExpenseTitles([
      { title: 'A', categoryId: 1 },
      { title: '  bb  ', categoryId: 2 },
    ])

    expect(result).toEqual([{ title: 'bb', categoryId: 2 }])
  })
})
