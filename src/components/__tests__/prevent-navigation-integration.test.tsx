import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PreventNavigation from '../prevent-navigation'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}))

describe('PreventNavigation integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset history state
    window.history.pushState(null, '', window.location.href)
  })

  /**
   * Validates: Requirements 9.1, 9.3, 9.4
   */
  it('shows dialog with "Leave" and "Stay" actions when form is dirty and user clicks a link', () => {
    render(
      <div>
        <a href="/other-page">Navigate Away</a>
        <PreventNavigation
          isDirty={true}
          resetData={jest.fn()}
          cancelLabel="Stay"
          confirmLabel="Leave"
        />
      </div>,
    )

    const link = screen.getByText('Navigate Away')
    fireEvent.click(link)

    expect(screen.getByRole('button', { name: 'Stay' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })

  /**
   * Validates: Requirements 9.4, 9.6
   */
  it('"Stay" action closes the dialog and preserves form state', async () => {
    const resetData = jest.fn()

    render(
      <div>
        <a href="/other-page">Navigate Away</a>
        <PreventNavigation
          isDirty={true}
          resetData={resetData}
          cancelLabel="Stay"
          confirmLabel="Leave"
        />
      </div>,
    )

    // Trigger the dialog by clicking the link
    const link = screen.getByText('Navigate Away')
    fireEvent.click(link)

    // Verify dialog is open
    expect(screen.getByRole('button', { name: 'Stay' })).toBeInTheDocument()

    // Click "Stay"
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))

    // Dialog should close
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Stay' }),
      ).not.toBeInTheDocument()
    })

    // resetData should NOT be called (form state preserved)
    expect(resetData).not.toHaveBeenCalled()
    // Navigation should NOT have occurred
    expect(mockPush).not.toHaveBeenCalled()
  })

  /**
   * Validates: Requirements 9.3, 9.5
   */
  it('"Leave" action calls resetData and allows navigation to proceed', async () => {
    const resetData = jest.fn()

    render(
      <div>
        <a href="/other-page">Navigate Away</a>
        <PreventNavigation
          isDirty={true}
          resetData={resetData}
          cancelLabel="Stay"
          confirmLabel="Leave"
        />
      </div>,
    )

    // Trigger the dialog by clicking the link
    const link = screen.getByText('Navigate Away')
    fireEvent.click(link)

    // Verify dialog is open
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()

    // Click "Leave"
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    })

    // resetData should be called
    expect(resetData).toHaveBeenCalledTimes(1)
    // Navigation should proceed
    expect(mockPush).toHaveBeenCalledWith('/other-page')
  })

  /**
   * Validates: Requirement 9.1
   */
  it('dialog appears when form is dirty and user attempts navigation', () => {
    render(
      <div>
        <a href="/dashboard">Go to Dashboard</a>
        <PreventNavigation
          isDirty={true}
          resetData={jest.fn()}
          cancelLabel="Stay"
          confirmLabel="Leave"
        />
      </div>,
    )

    // Attempt navigation via link click
    fireEvent.click(screen.getByText('Go to Dashboard'))

    // Dialog should appear with unsaved changes message
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
    expect(
      screen.getByText(
        'You have unsaved changes. If you leave now, they will be lost. Are you sure you want to leave?',
      ),
    ).toBeInTheDocument()
  })

  /**
   * Validates: Requirement 9.1 (negative case - pristine form)
   */
  it('dialog does NOT appear when form is pristine', () => {
    render(
      <div>
        <a href="/other-page">Navigate Away</a>
        <PreventNavigation
          isDirty={false}
          resetData={jest.fn()}
          cancelLabel="Stay"
          confirmLabel="Leave"
        />
      </div>,
    )

    // Click the link
    fireEvent.click(screen.getByText('Navigate Away'))

    // Dialog should NOT appear
    expect(
      screen.queryByRole('button', { name: 'Stay' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Leave' }),
    ).not.toBeInTheDocument()
  })
})
