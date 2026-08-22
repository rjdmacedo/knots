/**
 * Unit tests for the in-process group email digest scheduler.
 */

const mockProcessDue = jest.fn()

jest.mock('@/lib/email/group-activity-digest', () => ({
  processDueGroupEmailDigests: (...args: unknown[]) => mockProcessDue(...args),
}))

describe('startGroupEmailDigestScheduler', () => {
  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockProcessDue.mockResolvedValue({
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  async function loadScheduler() {
    const mod = await import('@/lib/email/group-activity-digest-scheduler')
    return mod.startGroupEmailDigestScheduler
  }

  it('runs an initial tick after boot and then on interval', async () => {
    const startGroupEmailDigestScheduler = await loadScheduler()
    startGroupEmailDigestScheduler(60_000)

    expect(mockProcessDue).not.toHaveBeenCalled()

    jest.advanceTimersByTime(5_000)
    await Promise.resolve()
    expect(mockProcessDue).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
    expect(mockProcessDue).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
    expect(mockProcessDue).toHaveBeenCalledTimes(3)
  })

  it('only starts once when called repeatedly', async () => {
    const startGroupEmailDigestScheduler = await loadScheduler()
    startGroupEmailDigestScheduler(60_000)
    startGroupEmailDigestScheduler(60_000)

    jest.advanceTimersByTime(5_000)
    await Promise.resolve()

    expect(mockProcessDue).toHaveBeenCalledTimes(1)
  })
})
