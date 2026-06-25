import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChangeList } from '../change-list'

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (key === 'fieldChangesCount') return `${params?.count} field changes`
      if (key === 'showMoreChanges') return `Show ${params?.count} more changes`
      if (key === 'showLess') return 'Show less'
      if (key === 'yes') return 'Yes'
      if (key === 'no') return 'No'
      if (key.startsWith('fieldLabels.')) return key.replace('fieldLabels.', '')
      return key
    }
    return t
  },
  useLocale: () => 'en-US',
}))

const defaultProps = {
  groupCurrency: {
    name: 'US Dollar',
    symbol_native: '$',
    symbol: '$',
    code: 'USD',
    name_plural: 'US dollars',
    rounding: 0,
    decimal_digits: 2,
  },
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
  categories: [{ id: 1, grouping: 'Food', name: 'Dinner' }],
}

describe('ChangeList - Unit Tests', () => {
  /**
   * Validates: Requirement 1.2
   */
  it('renders nothing when changes array is empty', () => {
    const { container } = render(<ChangeList {...defaultProps} changes={[]} />)
    expect(container.innerHTML).toBe('')
  })

  /**
   * Validates: Requirement 7.1
   */
  it('renders semantic HTML structure (ul > li)', () => {
    const changes = [
      { field: 'title', oldValue: 'Old Title', newValue: 'New Title' },
      { field: 'notes', oldValue: 'Note A', newValue: 'Note B' },
    ]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('UL')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    items.forEach((item) => {
      expect(item.tagName).toBe('LI')
    })
  })

  /**
   * Validates: Requirement 5.3
   */
  it('displays arrow separator (→) between old and new values', () => {
    const changes = [
      { field: 'title', oldValue: 'Old Title', newValue: 'New Title' },
    ]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('→')
    expect(item.textContent).toContain('Old Title')
    expect(item.textContent).toContain('New Title')
  })

  /**
   * Validates: Requirement 1.4
   */
  it('shows only new value when oldValue is null (addition)', () => {
    const changes = [{ field: 'title', oldValue: null, newValue: 'New Title' }]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('→')
    expect(item.textContent).toContain('New Title')
    expect(item.textContent).not.toContain('Old Title')
  })

  /**
   * Validates: Requirement 1.5
   */
  it('shows only old value when newValue is null (removal)', () => {
    const changes = [{ field: 'title', oldValue: 'Old Title', newValue: null }]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('→')
    expect(item.textContent).toContain('Old Title')
    expect(item.textContent).not.toContain('New Title')
  })

  /**
   * Validates: Requirement 5.6
   */
  it('toggle click does not trigger parent navigation (stopPropagation)', () => {
    const changes = [
      { field: 'title', oldValue: 'a', newValue: 'b' },
      { field: 'notes', oldValue: 'c', newValue: 'd' },
      { field: 'amount', oldValue: '100', newValue: '200' },
      { field: 'category', oldValue: '1', newValue: '1' },
    ]

    const parentClickHandler = jest.fn()

    const { container } = render(
      <div onClick={parentClickHandler}>
        <ChangeList {...defaultProps} changes={changes} />
      </div>,
    )

    const toggle = screen.getByRole('button')
    fireEvent.click(toggle)

    expect(parentClickHandler).not.toHaveBeenCalled()
  })

  /**
   * Validates: Requirement 7.4
   */
  it('toggle updates aria-expanded attribute', () => {
    const changes = [
      { field: 'title', oldValue: 'a', newValue: 'b' },
      { field: 'notes', oldValue: 'c', newValue: 'd' },
      { field: 'amount', oldValue: '100', newValue: '200' },
      { field: 'category', oldValue: '1', newValue: '1' },
    ]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const toggle = screen.getByRole('button')

    // Initially collapsed, so aria-expanded should be false
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Click to expand
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Click to collapse again
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  /**
   * Validates: Requirement 7.5
   */
  it('visually hidden "from"/"to" text is present for screen readers', () => {
    const changes = [
      { field: 'title', oldValue: 'Old Title', newValue: 'New Title' },
    ]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const item = screen.getByRole('listitem')

    // Check for sr-only spans with "from" and "to" text
    const srOnlyElements = item.querySelectorAll('.sr-only')
    const srTexts = Array.from(srOnlyElements).map((el) => el.textContent)

    expect(srTexts).toContain('from ')
    expect(srTexts).toContain(' to ')
  })

  /**
   * Validates: Requirement 1.3
   */
  it('displays field label as prefix before values', () => {
    const changes = [{ field: 'title', oldValue: 'Old', newValue: 'New' }]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const item = screen.getByRole('listitem')
    // The mock translation returns the field name for fieldLabels.X
    expect(item.textContent).toMatch(/^title:/)
  })

  /**
   * Validates: Requirement 7.3
   */
  it('includes aria-label with total change count', () => {
    const changes = [
      { field: 'title', oldValue: 'a', newValue: 'b' },
      { field: 'notes', oldValue: 'c', newValue: 'd' },
    ]

    render(<ChangeList {...defaultProps} changes={changes} />)

    const list = screen.getByRole('list')
    expect(list).toHaveAttribute('aria-label', '2 field changes')
  })
})
