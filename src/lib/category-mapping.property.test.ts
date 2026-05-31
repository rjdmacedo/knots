/**
 * Property-based tests for CategoryMappingService.
 *
 * Feature: expense-category-auto-assign
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.4, 4.1, 4.2, 4.3, 6.1, 6.3, 6.4
 */

import fc from 'fast-check'
import { normalizeTitle } from './category-mapping'

// --- Mocks ---

const mockUpsert = jest.fn()
const mockFindUnique = jest.fn()
const mockCategoryFindUnique = jest.fn()

jest.mock('./prisma', () => ({
  prisma: {
    expenseCategoryMapping: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    category: {
      findUnique: (...args: unknown[]) => mockCategoryFindUnique(...args),
    },
  },
}))

import {
  lookupCategoryMapping,
  upsertCategoryMapping,
} from './category-mapping'

// --- Constants ---

const PBT_NUM_RUNS = 200

// --- Generators ---

/** Arbitrary for a valid groupId (non-empty CUID-like string) */
const arbGroupId = fc.string({ minLength: 1, maxLength: 25 })

/** Arbitrary for a valid categoryId (positive integer) */
const arbCategoryId = fc.integer({ min: 1, max: 10000 })

/**
 * Arbitrary for a title that normalizes to at least 2 characters.
 * This ensures the short-title guard does not skip the upsert.
 */
const arbValidTitle = fc
  .string({ minLength: 2, maxLength: 100 })
  .filter((t) => normalizeTitle(t).length >= 2)

/**
 * Arbitrary for titles whose normalized form has fewer than 2 characters.
 * This includes:
 * - Empty strings
 * - Strings that are only whitespace
 * - Single characters (possibly surrounded by whitespace)
 */
const arbShortTitle = fc.oneof(
  // Empty string
  fc.constant(''),
  // Only whitespace (normalizes to empty)
  fc
    .array(fc.constantFrom(' ', '\t', '\n', '\r'), {
      minLength: 1,
      maxLength: 20,
    })
    .map((chars) => chars.join('')),
  // Single character possibly surrounded by whitespace
  fc
    .tuple(
      fc
        .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 })
        .map((chars) => chars.join('')),
      fc
        .string({ minLength: 1, maxLength: 1 })
        .filter((c) => c.trim().length > 0),
      fc
        .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 })
        .map((chars) => chars.join('')),
    )
    .map(([pre, ch, post]) => `${pre}${ch}${post}`),
)

// --- Tests ---

describe('CategoryMappingService - Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpsert.mockResolvedValue({})
    mockFindUnique.mockResolvedValue(null)
    mockCategoryFindUnique.mockResolvedValue(null)
  })

  /**
   * Feature: expense-category-auto-assign, Property 3: normalizeTitle idempotence and correctness
   *
   * For any string input, `normalizeTitle(normalizeTitle(input))` SHALL equal
   * `normalizeTitle(input)` (idempotence), and the result SHALL contain only
   * lowercase characters, no leading/trailing whitespace, and no consecutive
   * internal spaces.
   *
   * Validates: Requirements 1.3
   */
  describe('Property 3: normalizeTitle idempotence and correctness', () => {
    it('normalizeTitle is idempotent: applying it twice yields the same result as once', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
          const once = normalizeTitle(input)
          const twice = normalizeTitle(once)
          expect(twice).toBe(once)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('normalizeTitle result contains only lowercase characters (no uppercase)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
          const result = normalizeTitle(input)
          expect(result).toBe(result.toLowerCase())
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('normalizeTitle result has no leading or trailing whitespace', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
          const result = normalizeTitle(input)
          expect(result).toBe(result.trim())
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('normalizeTitle result has no consecutive internal spaces', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
          const result = normalizeTitle(input)
          expect(result).not.toMatch(/\s{2,}/)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 1: Upsert last-write-wins
   *
   * For any sequence of upsert calls with the same groupId and normalizedTitle (≥2 chars)
   * on non-reimbursement expenses, the stored mapping SHALL always reflect the categoryId
   * of the most recent upsert call.
   *
   * Validates: Requirements 1.1, 1.2, 2.1, 6.4
   */
  describe('Property 1: Upsert last-write-wins', () => {
    it('after multiple upserts with the same groupId and title, the last categoryId is always stored', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          fc.array(arbCategoryId, { minLength: 2, maxLength: 10 }),
          async (groupId, title, categoryIds) => {
            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            // Perform multiple upserts with different categoryIds
            for (const categoryId of categoryIds) {
              await upsertCategoryMapping({
                groupId,
                title,
                categoryId,
                isReimbursement: false,
              })
            }

            const lastCategoryId = categoryIds[categoryIds.length - 1]
            const normalized = normalizeTitle(title)

            // The last upsert call should contain the last categoryId
            const lastCall = mockUpsert.mock.calls[
              mockUpsert.mock.calls.length - 1
            ][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
              update: { categoryId: number }
              create: {
                groupId: string
                normalizedTitle: string
                categoryId: number
              }
            }

            // The upsert's update payload reflects the most recent categoryId
            expect(lastCall.update.categoryId).toBe(lastCategoryId)

            // The upsert targets the correct unique constraint
            expect(lastCall.where.groupId_normalizedTitle).toEqual({
              groupId,
              normalizedTitle: normalized,
            })

            // The create payload also uses the most recent categoryId
            expect(lastCall.create.categoryId).toBe(lastCategoryId)
            expect(lastCall.create.groupId).toBe(groupId)
            expect(lastCall.create.normalizedTitle).toBe(normalized)

            // Total upsert calls should equal the number of categoryIds
            expect(mockUpsert).toHaveBeenCalledTimes(categoryIds.length)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('each upsert call in a sequence targets the same unique constraint key', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          fc.array(arbCategoryId, { minLength: 2, maxLength: 5 }),
          async (groupId, title, categoryIds) => {
            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            const normalized = normalizeTitle(title)

            for (const categoryId of categoryIds) {
              await upsertCategoryMapping({
                groupId,
                title,
                categoryId,
                isReimbursement: false,
              })
            }

            // Every upsert call should target the same (groupId, normalizedTitle) key
            for (let i = 0; i < mockUpsert.mock.calls.length; i++) {
              const call = mockUpsert.mock.calls[i][0] as {
                where: {
                  groupId_normalizedTitle: {
                    groupId: string
                    normalizedTitle: string
                  }
                }
                update: { categoryId: number }
              }

              expect(call.where.groupId_normalizedTitle).toEqual({
                groupId,
                normalizedTitle: normalized,
              })

              // Each call's update payload matches the corresponding categoryId
              expect(call.update.categoryId).toBe(categoryIds[i])
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 4: Short title guard
   *
   * For any string whose normalized form has fewer than 2 characters,
   * calling upsertCategoryMapping SHALL not create or update any mapping.
   *
   * Validates: Requirements 1.4
   */
  describe('Property 4: Short title guard', () => {
    it('titles with normalization < 2 chars do not create/update mappings', () => {
      return fc.assert(
        fc.asyncProperty(
          arbShortTitle,
          arbGroupId,
          arbCategoryId,
          async (title, groupId, categoryId) => {
            // Precondition: verify the title actually normalizes to < 2 chars
            fc.pre(normalizeTitle(title).length < 2)

            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            await upsertCategoryMapping({
              groupId,
              title,
              categoryId,
              isReimbursement: false,
            })

            // The Prisma upsert should never be called for short titles
            expect(mockUpsert).not.toHaveBeenCalled()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 5: Reimbursement guard
   *
   * For any expense marked as reimbursement (isReimbursement=true), regardless of
   * title or category values, calling upsertCategoryMapping SHALL not create or
   * update any mapping.
   *
   * Validates: Requirements 2.4, 6.1, 6.3
   */
  describe('Property 5: Reimbursement guard', () => {
    it('expenses with isReimbursement=true never create or update mappings', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          async (groupId, title, categoryId) => {
            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            await upsertCategoryMapping({
              groupId,
              title,
              categoryId,
              isReimbursement: true,
            })

            // Prisma upsert should never be called for reimbursement expenses
            expect(mockUpsert).not.toHaveBeenCalled()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('non-reimbursement expenses with valid titles DO create mappings (contrast test)', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          async (groupId, title, categoryId) => {
            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            await upsertCategoryMapping({
              groupId,
              title,
              categoryId,
              isReimbursement: false,
            })

            // Prisma upsert SHOULD be called for non-reimbursement expenses with valid titles
            expect(mockUpsert).toHaveBeenCalledTimes(1)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 2: Title change preserves old mapping
   *
   * For any non-reimbursement expense edit where the title changes from A to B
   * (both normalizing to ≥2 chars), the mapping for normalizedTitle(A) SHALL remain
   * unchanged, and a mapping for normalizedTitle(B) SHALL be created or updated
   * with the current category.
   *
   * Validates: Requirements 2.2, 2.3
   */
  describe('Property 2: Title change preserves old mapping', () => {
    it('upsert with title B does not affect the mapping for title A', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbValidTitle,
          arbCategoryId,
          arbCategoryId,
          async (groupId, titleA, titleB, categoryIdA, categoryIdB) => {
            // Ensure the two titles normalize to different values
            fc.pre(normalizeTitle(titleA) !== normalizeTitle(titleB))

            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            const normalizedA = normalizeTitle(titleA)
            const normalizedB = normalizeTitle(titleB)

            // Step 1: Upsert with title A and categoryIdA (initial mapping)
            await upsertCategoryMapping({
              groupId,
              title: titleA,
              categoryId: categoryIdA,
              isReimbursement: false,
            })

            // Step 2: Upsert with title B and categoryIdB (simulating a title change)
            await upsertCategoryMapping({
              groupId,
              title: titleB,
              categoryId: categoryIdB,
              isReimbursement: false,
            })

            // Verify two upsert calls were made
            expect(mockUpsert).toHaveBeenCalledTimes(2)

            // First upsert targets normalizedTitle(A)
            const firstCall = mockUpsert.mock.calls[0][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
              update: { categoryId: number }
              create: {
                groupId: string
                normalizedTitle: string
                categoryId: number
              }
            }
            expect(
              firstCall.where.groupId_normalizedTitle.normalizedTitle,
            ).toBe(normalizedA)
            expect(firstCall.update.categoryId).toBe(categoryIdA)
            expect(firstCall.create.normalizedTitle).toBe(normalizedA)

            // Second upsert targets normalizedTitle(B), NOT normalizedTitle(A)
            const secondCall = mockUpsert.mock.calls[1][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
              update: { categoryId: number }
              create: {
                groupId: string
                normalizedTitle: string
                categoryId: number
              }
            }
            expect(
              secondCall.where.groupId_normalizedTitle.normalizedTitle,
            ).toBe(normalizedB)
            expect(secondCall.update.categoryId).toBe(categoryIdB)
            expect(secondCall.create.normalizedTitle).toBe(normalizedB)

            // The upsert for title B does NOT target title A's normalized key
            expect(
              secondCall.where.groupId_normalizedTitle.normalizedTitle,
            ).not.toBe(normalizedA)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('the mapping for title A is preserved with its original categoryId after title change to B', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbValidTitle,
          arbCategoryId,
          arbCategoryId,
          async (groupId, titleA, titleB, categoryIdA, categoryIdB) => {
            // Ensure the two titles normalize to different values
            fc.pre(normalizeTitle(titleA) !== normalizeTitle(titleB))

            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            const normalizedA = normalizeTitle(titleA)
            const normalizedB = normalizeTitle(titleB)

            // Simulate: first upsert with title A, then title change to B
            await upsertCategoryMapping({
              groupId,
              title: titleA,
              categoryId: categoryIdA,
              isReimbursement: false,
            })

            await upsertCategoryMapping({
              groupId,
              title: titleB,
              categoryId: categoryIdB,
              isReimbursement: false,
            })

            // Set up mock to simulate that both mappings exist independently
            mockFindUnique.mockImplementation(
              (args: {
                where: {
                  groupId_normalizedTitle: {
                    groupId: string
                    normalizedTitle: string
                  }
                }
              }) => {
                const { normalizedTitle: nt } =
                  args.where.groupId_normalizedTitle
                if (nt === normalizedA) {
                  return Promise.resolve({
                    id: 'mock-id-a',
                    groupId,
                    normalizedTitle: normalizedA,
                    categoryId: categoryIdA,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                  })
                }
                if (nt === normalizedB) {
                  return Promise.resolve({
                    id: 'mock-id-b',
                    groupId,
                    normalizedTitle: normalizedB,
                    categoryId: categoryIdB,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                  })
                }
                return Promise.resolve(null)
              },
            )

            mockCategoryFindUnique.mockResolvedValue({
              id: categoryIdA,
              name: 'Test Category',
            })

            // Lookup title A — should still return categoryIdA (unchanged)
            const resultA = await lookupCategoryMapping({
              groupId,
              title: titleA,
            })
            expect(resultA).toBe(categoryIdA)

            // Verify the lookup for title A used normalizedTitle(A)
            const findCalls = mockFindUnique.mock.calls
            const lookupACall = findCalls.find(
              (
                call: {
                  where: {
                    groupId_normalizedTitle: { normalizedTitle: string }
                  }
                }[],
              ) =>
                call[0].where.groupId_normalizedTitle.normalizedTitle ===
                normalizedA,
            )
            expect(lookupACall).toBeDefined()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 7: Group isolation
   *
   * For any two distinct groupIds and the same normalizedTitle, upserting a mapping
   * in one group SHALL not affect the lookup result in the other group.
   *
   * Validates: Requirements 4.1, 4.2, 4.3
   */
  describe('Property 7: Group isolation', () => {
    it('upserting a mapping in one group does not affect lookup in another group', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          async (groupIdA, groupIdB, title, categoryId) => {
            // Ensure the two groupIds are distinct
            fc.pre(groupIdA !== groupIdB)

            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            const normalized = normalizeTitle(title)

            // Simulate group-scoped storage: only groupA has a mapping
            // When lookupCategoryMapping queries for groupB, it should find nothing
            mockFindUnique.mockImplementation(
              (args: {
                where: {
                  groupId_normalizedTitle: {
                    groupId: string
                    normalizedTitle: string
                  }
                }
              }) => {
                const { groupId, normalizedTitle } =
                  args.where.groupId_normalizedTitle
                // Only groupA has the mapping stored
                if (groupId === groupIdA && normalizedTitle === normalized) {
                  return Promise.resolve({
                    id: 'mock-id',
                    groupId: groupIdA,
                    normalizedTitle: normalized,
                    categoryId,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                  })
                }
                // groupB has no mapping for this title
                return Promise.resolve(null)
              },
            )

            // Category exists (for validation in lookupCategoryMapping)
            mockCategoryFindUnique.mockResolvedValue({
              id: categoryId,
              name: 'Test Category',
            })

            // Upsert in groupA
            await upsertCategoryMapping({
              groupId: groupIdA,
              title,
              categoryId,
              isReimbursement: false,
            })

            // Verify upsert was scoped to groupA
            expect(mockUpsert).toHaveBeenCalledTimes(1)
            const upsertCall = mockUpsert.mock.calls[0][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
            }
            expect(upsertCall.where.groupId_normalizedTitle.groupId).toBe(
              groupIdA,
            )

            // Lookup in groupA should return the categoryId
            const resultA = await lookupCategoryMapping({
              groupId: groupIdA,
              title,
            })
            expect(resultA).toBe(categoryId)

            // Lookup in groupB should return null (not affected by groupA's upsert)
            const resultB = await lookupCategoryMapping({
              groupId: groupIdB,
              title,
            })
            expect(resultB).toBeNull()

            // Verify that lookupCategoryMapping queried with the correct group-scoped keys
            const findUniqueCalls = mockFindUnique.mock.calls
            const groupBLookup = findUniqueCalls.find(
              (
                call: {
                  where: {
                    groupId_normalizedTitle: {
                      groupId: string
                      normalizedTitle: string
                    }
                  }
                }[],
              ) => call[0].where.groupId_normalizedTitle.groupId === groupIdB,
            )
            expect(groupBLookup).toBeDefined()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('two groups with the same title can have independent category mappings', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          arbCategoryId,
          async (groupIdA, groupIdB, title, categoryIdA, categoryIdB) => {
            // Ensure the two groupIds are distinct and categoryIds are different
            fc.pre(groupIdA !== groupIdB)
            fc.pre(categoryIdA !== categoryIdB)

            jest.clearAllMocks()
            mockUpsert.mockResolvedValue({})

            const normalized = normalizeTitle(title)

            // Simulate group-scoped storage: each group has its own mapping
            mockFindUnique.mockImplementation(
              (args: {
                where: {
                  groupId_normalizedTitle: {
                    groupId: string
                    normalizedTitle: string
                  }
                }
              }) => {
                const { groupId, normalizedTitle } =
                  args.where.groupId_normalizedTitle
                if (groupId === groupIdA && normalizedTitle === normalized) {
                  return Promise.resolve({
                    id: 'mock-id-a',
                    groupId: groupIdA,
                    normalizedTitle: normalized,
                    categoryId: categoryIdA,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                  })
                }
                if (groupId === groupIdB && normalizedTitle === normalized) {
                  return Promise.resolve({
                    id: 'mock-id-b',
                    groupId: groupIdB,
                    normalizedTitle: normalized,
                    categoryId: categoryIdB,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                  })
                }
                return Promise.resolve(null)
              },
            )

            // Both categories exist
            mockCategoryFindUnique.mockImplementation(
              (args: { where: { id: number } }) => {
                if (
                  args.where.id === categoryIdA ||
                  args.where.id === categoryIdB
                ) {
                  return Promise.resolve({
                    id: args.where.id,
                    name: 'Test Category',
                  })
                }
                return Promise.resolve(null)
              },
            )

            // Upsert in both groups
            await upsertCategoryMapping({
              groupId: groupIdA,
              title,
              categoryId: categoryIdA,
              isReimbursement: false,
            })
            await upsertCategoryMapping({
              groupId: groupIdB,
              title,
              categoryId: categoryIdB,
              isReimbursement: false,
            })

            // Verify each upsert was scoped to its respective group
            expect(mockUpsert).toHaveBeenCalledTimes(2)
            const firstUpsert = mockUpsert.mock.calls[0][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
              update: { categoryId: number }
            }
            const secondUpsert = mockUpsert.mock.calls[1][0] as {
              where: {
                groupId_normalizedTitle: {
                  groupId: string
                  normalizedTitle: string
                }
              }
              update: { categoryId: number }
            }

            expect(firstUpsert.where.groupId_normalizedTitle.groupId).toBe(
              groupIdA,
            )
            expect(firstUpsert.update.categoryId).toBe(categoryIdA)

            expect(secondUpsert.where.groupId_normalizedTitle.groupId).toBe(
              groupIdB,
            )
            expect(secondUpsert.update.categoryId).toBe(categoryIdB)

            // Lookup in groupA returns categoryIdA
            const resultA = await lookupCategoryMapping({
              groupId: groupIdA,
              title,
            })
            expect(resultA).toBe(categoryIdA)

            // Lookup in groupB returns categoryIdB (independent from groupA)
            const resultB = await lookupCategoryMapping({
              groupId: groupIdB,
              title,
            })
            expect(resultB).toBe(categoryIdB)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Feature: expense-category-auto-assign, Property 6: Lookup round-trip with category validity
   *
   * For any valid mapping (groupId, normalizedTitle, categoryId) where the categoryId
   * corresponds to an existing category, `lookupCategoryMapping(groupId, title)` SHALL
   * return that categoryId. If the categoryId does not correspond to a valid category,
   * lookup SHALL return null.
   *
   * Validates: Requirements 3.1, 3.4
   */
  describe('Property 6: Lookup round-trip with category validity', () => {
    it('when a mapping exists AND the category is valid, lookupCategoryMapping returns the correct categoryId', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          async (groupId, title, categoryId) => {
            jest.clearAllMocks()

            const normalized = normalizeTitle(title)

            // Simulate: mapping exists in the database
            mockFindUnique.mockResolvedValue({
              id: 'mock-mapping-id',
              groupId,
              normalizedTitle: normalized,
              categoryId,
              updatedAt: new Date(),
              createdAt: new Date(),
            })

            // Simulate: category still exists (valid)
            mockCategoryFindUnique.mockResolvedValue({
              id: categoryId,
              name: 'Valid Category',
            })

            const result = await lookupCategoryMapping({ groupId, title })

            // Should return the categoryId from the mapping
            expect(result).toBe(categoryId)

            // Verify the mapping was queried with the correct key
            expect(mockFindUnique).toHaveBeenCalledWith({
              where: {
                groupId_normalizedTitle: {
                  groupId,
                  normalizedTitle: normalized,
                },
              },
            })

            // Verify category validation was performed
            expect(mockCategoryFindUnique).toHaveBeenCalledWith({
              where: { id: categoryId },
            })
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('when a mapping exists BUT the category is no longer valid (deleted from DB), lookupCategoryMapping returns null', () => {
      return fc.assert(
        fc.asyncProperty(
          arbGroupId,
          arbValidTitle,
          arbCategoryId,
          async (groupId, title, categoryId) => {
            jest.clearAllMocks()

            const normalized = normalizeTitle(title)

            // Simulate: mapping exists in the database
            mockFindUnique.mockResolvedValue({
              id: 'mock-mapping-id',
              groupId,
              normalizedTitle: normalized,
              categoryId,
              updatedAt: new Date(),
              createdAt: new Date(),
            })

            // Simulate: category no longer exists (deleted)
            mockCategoryFindUnique.mockResolvedValue(null)

            const result = await lookupCategoryMapping({ groupId, title })

            // Should return null because the category is invalid
            expect(result).toBeNull()

            // Verify the mapping was still queried
            expect(mockFindUnique).toHaveBeenCalledWith({
              where: {
                groupId_normalizedTitle: {
                  groupId,
                  normalizedTitle: normalized,
                },
              },
            })

            // Verify category validation was attempted
            expect(mockCategoryFindUnique).toHaveBeenCalledWith({
              where: { id: categoryId },
            })
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('when no mapping exists, lookupCategoryMapping returns null', () => {
      return fc.assert(
        fc.asyncProperty(arbGroupId, arbValidTitle, async (groupId, title) => {
          jest.clearAllMocks()

          const normalized = normalizeTitle(title)

          // Simulate: no mapping exists
          mockFindUnique.mockResolvedValue(null)

          const result = await lookupCategoryMapping({ groupId, title })

          // Should return null because no mapping exists
          expect(result).toBeNull()

          // Verify the mapping was queried with the correct key
          expect(mockFindUnique).toHaveBeenCalledWith({
            where: {
              groupId_normalizedTitle: {
                groupId,
                normalizedTitle: normalized,
              },
            },
          })

          // Category validation should NOT be called when no mapping exists
          expect(mockCategoryFindUnique).not.toHaveBeenCalled()
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
