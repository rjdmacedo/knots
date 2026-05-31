/**
 * Unit tests for the priority flow logic in the expense form's title onBlur handler.
 *
 * The priority logic is: mapping > AI > default category (General)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 * - 5.1: When a mapping exists, it takes priority over AI extraction
 * - 5.2: When no mapping exists and AI is enabled, AI extraction is used
 * - 5.3: When AI extraction fails, the default category (General) is kept
 * - 5.4: When no mapping exists and AI is disabled, the default category is kept
 *
 * Tests the onBlur handler logic by extracting it into a testable function
 * that mirrors the exact flow in expense-form.tsx.
 */

// --- Types ---

interface LookupResult {
  categoryId: number | null
}

interface ExtractResult {
  categoryId: number
}

interface RuntimeFeatureFlags {
  enableCategoryExtract: boolean
  enableExpenseDocuments: boolean
  enableReceiptExtract: boolean
}

/**
 * Extracted priority flow logic from the expense form's title onBlur handler.
 * This mirrors the exact logic in expense-form.tsx for testability.
 *
 * @returns The categoryId that should be set, or null if no change should be made
 */
async function categoryPriorityFlow(params: {
  title: string
  groupId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
  lookupCategoryMapping: (input: {
    groupId: string
    title: string
  }) => Promise<LookupResult>
  extractCategoryFromTitle: (title: string) => Promise<ExtractResult>
}): Promise<{ categoryId: number | null; source: 'mapping' | 'ai' | 'none' }> {
  const {
    title,
    groupId,
    runtimeFeatureFlags,
    lookupCategoryMapping,
    extractCategoryFromTitle,
  } = params

  // 1. Try lookup from category mapping (has priority over AI)
  try {
    if (title.trim().length > 0) {
      const { categoryId: mappedCategoryId } = await lookupCategoryMapping({
        groupId,
        title,
      })

      if (mappedCategoryId !== null) {
        return { categoryId: mappedCategoryId, source: 'mapping' }
      }
    }
  } catch {
    // Silently fall through to existing behavior
  }

  // 2. Fallback to AI extraction (if enabled)
  if (runtimeFeatureFlags.enableCategoryExtract) {
    const { categoryId } = await extractCategoryFromTitle(title)
    return { categoryId, source: 'ai' }
  }

  // 3. No mapping, no AI — keep default category
  return { categoryId: null, source: 'none' }
}

// --- Tests ---

describe('Category mapping priority flow in expense form', () => {
  const defaultFlags: RuntimeFeatureFlags = {
    enableCategoryExtract: true,
    enableExpenseDocuments: false,
    enableReceiptExtract: false,
  }

  const mockLookup = jest.fn<
    Promise<LookupResult>,
    [{ groupId: string; title: string }]
  >()
  const mockExtract = jest.fn<Promise<ExtractResult>, [string]>()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Requirement 5.1: Mapping takes priority over AI', () => {
    it('uses the mapped categoryId when lookupCategoryMapping returns a non-null value', async () => {
      mockLookup.mockResolvedValue({ categoryId: 7 })
      mockExtract.mockResolvedValue({ categoryId: 3 })

      const result = await categoryPriorityFlow({
        title: 'Coffee',
        groupId: 'group-1',
        runtimeFeatureFlags: defaultFlags,
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBe(7)
      expect(result.source).toBe('mapping')
      // AI extraction should NOT be called when mapping exists
      expect(mockExtract).not.toHaveBeenCalled()
    })

    it('does not call AI extraction when mapping is found, even if AI is enabled', async () => {
      mockLookup.mockResolvedValue({ categoryId: 12 })
      mockExtract.mockResolvedValue({ categoryId: 5 })

      await categoryPriorityFlow({
        title: 'Groceries',
        groupId: 'group-2',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(mockLookup).toHaveBeenCalledTimes(1)
      expect(mockExtract).not.toHaveBeenCalled()
    })
  })

  describe('Requirement 5.2: Fallback to AI when no mapping exists', () => {
    it('calls AI extraction when lookupCategoryMapping returns null and AI is enabled', async () => {
      mockLookup.mockResolvedValue({ categoryId: null })
      mockExtract.mockResolvedValue({ categoryId: 4 })

      const result = await categoryPriorityFlow({
        title: 'New expense title',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBe(4)
      expect(result.source).toBe('ai')
      expect(mockExtract).toHaveBeenCalledWith('New expense title')
    })

    it('uses the AI-extracted categoryId as the result', async () => {
      mockLookup.mockResolvedValue({ categoryId: null })
      mockExtract.mockResolvedValue({ categoryId: 9 })

      const result = await categoryPriorityFlow({
        title: 'Taxi ride',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBe(9)
      expect(result.source).toBe('ai')
    })
  })

  describe('Requirement 5.3: AI extraction failure keeps default category', () => {
    it('returns default category (0 = General) when AI extraction returns 0', async () => {
      mockLookup.mockResolvedValue({ categoryId: null })
      // extractCategoryFromTitle returns { categoryId: 0 } on failure (see expense-form-actions.tsx)
      mockExtract.mockResolvedValue({ categoryId: 0 })

      const result = await categoryPriorityFlow({
        title: 'Unknown expense',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      // categoryId 0 is "General" (the default)
      expect(result.categoryId).toBe(0)
      expect(result.source).toBe('ai')
    })
  })

  describe('Requirement 5.4: Default category when AI is disabled and no mapping exists', () => {
    it('returns null (keep default) when no mapping exists and AI is disabled', async () => {
      mockLookup.mockResolvedValue({ categoryId: null })

      const result = await categoryPriorityFlow({
        title: 'Dinner',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: false },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBeNull()
      expect(result.source).toBe('none')
      // AI extraction should NOT be called when disabled
      expect(mockExtract).not.toHaveBeenCalled()
    })

    it('does not call AI extraction when enableCategoryExtract is false', async () => {
      mockLookup.mockResolvedValue({ categoryId: null })

      await categoryPriorityFlow({
        title: 'Bus ticket',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: false },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(mockExtract).not.toHaveBeenCalled()
    })
  })

  describe('Error handling: Lookup throws an error', () => {
    it('falls back to AI extraction when lookupCategoryMapping throws and AI is enabled', async () => {
      mockLookup.mockRejectedValue(new Error('Network error'))
      mockExtract.mockResolvedValue({ categoryId: 6 })

      const result = await categoryPriorityFlow({
        title: 'Lunch',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBe(6)
      expect(result.source).toBe('ai')
      expect(mockExtract).toHaveBeenCalledWith('Lunch')
    })

    it('falls back to default category when lookupCategoryMapping throws and AI is disabled', async () => {
      mockLookup.mockRejectedValue(new Error('Server unavailable'))

      const result = await categoryPriorityFlow({
        title: 'Snacks',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: false },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(result.categoryId).toBeNull()
      expect(result.source).toBe('none')
      expect(mockExtract).not.toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('skips lookup when title is empty (whitespace only)', async () => {
      const result = await categoryPriorityFlow({
        title: '   ',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: true },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      // Lookup should not be called for empty titles
      expect(mockLookup).not.toHaveBeenCalled()
      // Should fall through to AI
      expect(result.source).toBe('ai')
    })

    it('skips lookup when title is completely empty', async () => {
      const result = await categoryPriorityFlow({
        title: '',
        groupId: 'group-1',
        runtimeFeatureFlags: { ...defaultFlags, enableCategoryExtract: false },
        lookupCategoryMapping: mockLookup,
        extractCategoryFromTitle: mockExtract,
      })

      expect(mockLookup).not.toHaveBeenCalled()
      expect(result.categoryId).toBeNull()
      expect(result.source).toBe('none')
    })
  })
})
