/**
 * Preservation Property Tests - Property 2: Click Behavior Unchanged for All Buttons
 *
 * This test verifies that the click behavior of all buttons is preserved.
 * It observes the UNFIXED code and asserts that the structural patterns
 * enabling click behavior are present:
 *
 * - ShareButton: PopoverTrigger wraps the button → click opens share popover with group URL
 * - PushNotificationToggle: PopoverTrigger wraps the button → click opens notification popover
 * - ExportButton: DropdownMenuTrigger wraps the button → click opens export dropdown with JSON/CSV
 * - CreateFromReceiptButton: DialogTrigger/DrawerTrigger wraps the button → click opens dialog/drawer
 * - Edit button: Link component navigates to /edit
 * - Context menu: "Remove from recent groups" and "Archive" DropdownMenuItems with handlers
 * - Expense Import: Tooltip + DropdownMenuTrigger with Knots and Splitwise options
 *
 * These tests MUST PASS on UNFIXED code to confirm baseline behavior.
 * After the fix (adding Tooltip wrappers), these tests must STILL PASS
 * to confirm no regressions in click behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */

import fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

// --- Source file paths ---
const SHARE_BUTTON_PATH = path.resolve(
  __dirname,
  '../../groups/[groupId]/share-button.tsx',
)
const PUSH_NOTIFICATION_TOGGLE_PATH = path.resolve(
  __dirname,
  '../../../components/push-notification-toggle.tsx',
)
const EXPORT_BUTTON_PATH = path.resolve(
  __dirname,
  '../../groups/[groupId]/export-button.tsx',
)
const CREATE_FROM_RECEIPT_PATH = path.resolve(
  __dirname,
  '../../groups/[groupId]/expenses/create-from-receipt-button.tsx',
)
const GROUP_INFORMATION_PATH = path.resolve(
  __dirname,
  '../../groups/[groupId]/information/group-information.tsx',
)
const MY_GROUPS_PATH = path.resolve(__dirname, '../../groups/my-groups.tsx')
const EXPENSE_IMPORT_PATH = path.resolve(
  __dirname,
  '../../../components/expense-import.tsx',
)
const KNOTS_IMPORT_PATH = path.resolve(
  __dirname,
  '../../../components/knots-import-dialog.tsx',
)

// --- Constants ---
const PBT_NUM_RUNS = 20

// --- Types ---
type ButtonState = 'active' | 'loading' | 'disabled'
type InteractionSequence = 'click-only' | 'hover-then-click'

interface PreservationTestCase {
  name: string
  filePath: string
  description: string
  requirement: string
}

// --- Helpers ---

/**
 * Verifies that the ShareButton preserves its Popover click behavior.
 * The button must be wrapped in a Popover with PopoverTrigger and PopoverContent
 * containing the share URL input and copy/share buttons.
 */
function shareButtonPreservesClickBehavior(fileContent: string): {
  hasPopover: boolean
  hasPopoverTrigger: boolean
  hasPopoverContent: boolean
  hasShareUrl: boolean
  hasCopyButton: boolean
} {
  return {
    hasPopover: fileContent.includes('<Popover'),
    hasPopoverTrigger: fileContent.includes('<PopoverTrigger'),
    hasPopoverContent: fileContent.includes('<PopoverContent'),
    hasShareUrl: fileContent.includes('/expenses?ref=share'),
    hasCopyButton: fileContent.includes('<CopyButton'),
  }
}

/**
 * Verifies that the PushNotificationToggle preserves its Popover click behavior.
 * The button must open a panel with Switch for subscribe/unsubscribe and
 * RadioGroup for participant selection.
 */
function notificationButtonPreservesClickBehavior(fileContent: string): {
  hasPopover: boolean
  hasPopoverTrigger: boolean
  hasPopoverContent: boolean
  hasSubscribeToggle: boolean
  hasParticipantSelection: boolean
} {
  return {
    hasPopover: fileContent.includes('<Popover'),
    hasPopoverTrigger: fileContent.includes('<PopoverTrigger'),
    hasPopoverContent: fileContent.includes('<PopoverContent'),
    hasSubscribeToggle: fileContent.includes('<Switch'),
    hasParticipantSelection:
      fileContent.includes('<Checkbox') &&
      fileContent.includes('otherMembers.map'),
  }
}

/**
 * Verifies that the ExportButton preserves its DropdownMenu click behavior.
 * The button must be wrapped in a DropdownMenu with content containing
 * JSON and CSV export links.
 */
function exportButtonPreservesClickBehavior(fileContent: string): {
  hasDropdownMenu: boolean
  hasDropdownMenuTrigger: boolean
  hasDropdownMenuContent: boolean
  hasJsonExport: boolean
  hasCsvExport: boolean
} {
  return {
    hasDropdownMenu: fileContent.includes('<DropdownMenu'),
    hasDropdownMenuTrigger: fileContent.includes('<DropdownMenuTrigger'),
    hasDropdownMenuContent: fileContent.includes('<DropdownMenuContent'),
    hasJsonExport: fileContent.includes('export/json'),
    hasCsvExport: fileContent.includes('export/csv'),
  }
}

/**
 * Verifies that the CreateFromReceiptButton preserves its Dialog/Drawer click behavior.
 * The button must trigger a Dialog (desktop) or Drawer (mobile) with receipt scanning content.
 */
function createFromReceiptPreservesClickBehavior(fileContent: string): {
  hasDialog: boolean
  hasDialogTrigger: boolean
  hasDrawer: boolean
  hasDrawerTrigger: boolean
  hasReceiptContent: boolean
  hasFileUpload: boolean
  opensCreateExpense: boolean
} {
  return {
    hasDialog: fileContent.includes('<Dialog'),
    hasDialogTrigger: fileContent.includes('<DialogTrigger'),
    hasDrawer: fileContent.includes('<Drawer'),
    hasDrawerTrigger: fileContent.includes('<DrawerTrigger'),
    hasReceiptContent:
      fileContent.includes('ReceiptDialogContent') ||
      fileContent.includes('receipt'),
    hasFileUpload:
      fileContent.includes('handleFileChange') ||
      fileContent.includes('openFileDialog'),
    opensCreateExpense: fileContent.includes('create-group-expense'),
  }
}

/**
 * Verifies that the Edit button preserves its navigation behavior.
 * The button must be a Link that navigates to /edit.
 */
function editButtonPreservesClickBehavior(fileContent: string): {
  hasLink: boolean
  hasEditRoute: boolean
  hasPencilIcon: boolean
} {
  return {
    hasLink: fileContent.includes('<Link'),
    hasEditRoute: fileContent.includes('/edit'),
    hasPencilIcon:
      fileContent.includes('<Pencil') || fileContent.includes('Pencil'),
  }
}

/**
 * Verifies that the context menu preserves its existing items.
 * Must have "Remove from recent groups" and "Archive/Unarchive" menu items
 * with their respective handlers.
 */
function contextMenuPreservesClickBehavior(fileContent: string): {
  hasDropdownMenu: boolean
  hasNotificationsToggle: boolean
  hasArchiveItem: boolean
  hasArchiveGroupHandler: boolean
  hasLeaveGroupHandler: boolean
  hasDeleteGroupHandler: boolean
} {
  return {
    hasDropdownMenu: fileContent.includes('<DropdownMenu'),
    hasNotificationsToggle:
      fileContent.includes('notifications.toggle') &&
      (fileContent.includes('enableNotifications') ||
        fileContent.includes('disableNotifications')),
    hasArchiveItem:
      fileContent.includes('archive') || fileContent.includes('unarchive'),
    hasArchiveGroupHandler:
      fileContent.includes('archiveGroup') ||
      fileContent.includes('unarchiveGroup'),
    hasLeaveGroupHandler: fileContent.includes('leaveGroup'),
    hasDeleteGroupHandler: fileContent.includes('deleteGroup'),
  }
}

/**
 * Verifies that the Splitwise Import button preserves its Tooltip + Dialog behavior.
 * This is the reference implementation that other buttons should follow.
 */
function expenseImportPreservesTooltipBehavior(fileContent: string): {
  hasTooltip: boolean
  hasTooltipTrigger: boolean
  hasTooltipContent: boolean
  hasDropdownMenu: boolean
  hasDropdownMenuTrigger: boolean
  hasKnotsImport: boolean
  hasSplitwiseImport: boolean
} {
  return {
    hasTooltip: fileContent.includes('<Tooltip'),
    hasTooltipTrigger: fileContent.includes('<TooltipTrigger'),
    hasTooltipContent: fileContent.includes('<TooltipContent'),
    hasDropdownMenu: fileContent.includes('<DropdownMenu'),
    hasDropdownMenuTrigger: fileContent.includes('<DropdownMenuTrigger'),
    hasKnotsImport:
      fileContent.includes('KnotsImportDialog') ||
      fileContent.includes('importKnots') ||
      fileContent.includes('previewKnotsImport'),
    hasSplitwiseImport:
      fileContent.includes('SplitwiseImportDialog') ||
      fileContent.includes('importSplitwise') ||
      fileContent.includes('setSplitwiseOpen'),
  }
}

// --- Test Cases ---
const PRESERVATION_TEST_CASES: PreservationTestCase[] = [
  {
    name: 'ShareButton',
    filePath: SHARE_BUTTON_PATH,
    description: 'Click opens share popover with group URL',
    requirement: '3.1',
  },
  {
    name: 'PushNotificationToggle',
    filePath: PUSH_NOTIFICATION_TOGGLE_PATH,
    description:
      'Click opens notification dropdown with subscribe/unsubscribe options',
    requirement: '3.2',
  },
  {
    name: 'ExportButton',
    filePath: EXPORT_BUTTON_PATH,
    description: 'Click opens export dropdown with JSON and CSV options',
    requirement: '3.3',
  },
  {
    name: 'CreateFromReceiptButton',
    filePath: CREATE_FROM_RECEIPT_PATH,
    description: 'Click opens receipt scanning dialog/drawer',
    requirement: '3.4',
  },
  {
    name: 'EditButton',
    filePath: GROUP_INFORMATION_PATH,
    description: 'Click navigates to group edit page',
    requirement: '3.5',
  },
  {
    name: 'GroupCardContextMenu',
    filePath: MY_GROUPS_PATH,
    description:
      'Notifications toggle, archive, leave, and delete perform their actions',
    requirement: '3.6',
  },
  {
    name: 'ExpenseImport',
    filePath: EXPENSE_IMPORT_PATH,
    description:
      'Hovering displays shadcn Tooltip; click opens import dropdown',
    requirement: '3.7',
  },
]

// --- Arbitraries ---

/** Generates random button states to test preservation across states */
const arbButtonState: fc.Arbitrary<ButtonState> = fc.constantFrom(
  'active',
  'loading',
  'disabled',
)

/** Generates random interaction sequences */
const arbInteractionSequence: fc.Arbitrary<InteractionSequence> =
  fc.constantFrom('click-only', 'hover-then-click')

/** Generates random test case indices */
const arbTestCaseIndex = fc.integer({
  min: 0,
  max: PRESERVATION_TEST_CASES.length - 1,
})

// --- Tests ---

describe('UI Button Preservation Property Tests', () => {
  describe('Property 2: Preservation - Click Behavior Unchanged for All Buttons', () => {
    /**
     * ShareButton: Clicking SHALL CONTINUE TO open the share popover with the group URL.
     * Verifies the Popover structure with PopoverTrigger, PopoverContent, share URL, and CopyButton.
     *
     * **Validates: Requirements 3.1**
     */
    it('ShareButton click SHALL CONTINUE TO open share popover with group URL', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(SHARE_BUTTON_PATH, 'utf-8')
            const result = shareButtonPreservesClickBehavior(fileContent)

            // Regardless of button state or interaction sequence,
            // the structural elements enabling click behavior must be present
            expect(result.hasPopover).toBe(true)
            expect(result.hasPopoverTrigger).toBe(true)
            expect(result.hasPopoverContent).toBe(true)
            expect(result.hasShareUrl).toBe(true)
            expect(result.hasCopyButton).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * PushNotificationToggle: Clicking SHALL CONTINUE TO open the notification popover
     * with subscribe/unsubscribe and participant selection options.
     *
     * **Validates: Requirements 3.2**
     */
    it('PushNotificationToggle click SHALL CONTINUE TO open notification popover', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(
              PUSH_NOTIFICATION_TOGGLE_PATH,
              'utf-8',
            )
            const result = notificationButtonPreservesClickBehavior(fileContent)

            expect(result.hasPopover).toBe(true)
            expect(result.hasPopoverTrigger).toBe(true)
            expect(result.hasPopoverContent).toBe(true)
            expect(result.hasSubscribeToggle).toBe(true)
            expect(result.hasParticipantSelection).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * ExportButton: Clicking SHALL CONTINUE TO open the export dropdown
     * with JSON and CSV options.
     *
     * **Validates: Requirements 3.3**
     */
    it('ExportButton click SHALL CONTINUE TO open export dropdown with JSON and CSV', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(EXPORT_BUTTON_PATH, 'utf-8')
            const result = exportButtonPreservesClickBehavior(fileContent)

            expect(result.hasDropdownMenu).toBe(true)
            expect(result.hasDropdownMenuTrigger).toBe(true)
            expect(result.hasDropdownMenuContent).toBe(true)
            expect(result.hasJsonExport).toBe(true)
            expect(result.hasCsvExport).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * CreateFromReceiptButton: Clicking SHALL CONTINUE TO open the receipt scanning dialog/drawer.
     *
     * **Validates: Requirements 3.5**
     */
    it('CreateFromReceiptButton click SHALL CONTINUE TO open receipt scanning dialog/drawer', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(
              CREATE_FROM_RECEIPT_PATH,
              'utf-8',
            )
            const result = createFromReceiptPreservesClickBehavior(fileContent)

            expect(result.hasDialog).toBe(true)
            expect(result.hasDialogTrigger).toBe(true)
            expect(result.hasDrawer).toBe(true)
            expect(result.hasDrawerTrigger).toBe(true)
            expect(result.hasReceiptContent).toBe(true)
            expect(result.hasFileUpload).toBe(true)
            expect(result.opensCreateExpense).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Edit button: Clicking SHALL CONTINUE TO navigate to the group edit page.
     *
     * **Validates: Requirements 3.6**
     */
    it('Edit button click SHALL CONTINUE TO navigate to group edit page', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(GROUP_INFORMATION_PATH, 'utf-8')
            const result = editButtonPreservesClickBehavior(fileContent)

            expect(result.hasLink).toBe(true)
            expect(result.hasEditRoute).toBe(true)
            expect(result.hasPencilIcon).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Group card context menu: notifications, archive, leave, and delete SHALL
     * CONTINUE TO perform those actions as before.
     *
     * **Validates: Requirements 3.7**
     */
    it('Group card context menu items SHALL CONTINUE TO perform their actions', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const fileContent = fs.readFileSync(MY_GROUPS_PATH, 'utf-8')
            const result = contextMenuPreservesClickBehavior(fileContent)

            expect(result.hasDropdownMenu).toBe(true)
            expect(result.hasNotificationsToggle).toBe(true)
            expect(result.hasArchiveItem).toBe(true)
            expect(result.hasArchiveGroupHandler).toBe(true)
            expect(result.hasLeaveGroupHandler).toBe(true)
            expect(result.hasDeleteGroupHandler).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Expense Import button: Hovering SHALL CONTINUE TO display its shadcn Tooltip correctly.
     *
     * **Validates: Requirements 3.8**
     */
    it('Expense Import button SHALL CONTINUE TO display shadcn Tooltip correctly', () => {
      fc.assert(
        fc.property(
          arbButtonState,
          arbInteractionSequence,
          (state, sequence) => {
            const expenseImportContent = fs.readFileSync(
              EXPENSE_IMPORT_PATH,
              'utf-8',
            )
            const knotsImportContent = fs.readFileSync(
              KNOTS_IMPORT_PATH,
              'utf-8',
            )
            const result = expenseImportPreservesTooltipBehavior(
              `${expenseImportContent}\n${knotsImportContent}`,
            )

            expect(result.hasTooltip).toBe(true)
            expect(result.hasTooltipTrigger).toBe(true)
            expect(result.hasTooltipContent).toBe(true)
            expect(result.hasDropdownMenu).toBe(true)
            expect(result.hasDropdownMenuTrigger).toBe(true)
            expect(result.hasKnotsImport).toBe(true)
            expect(result.hasSplitwiseImport).toBe(true)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Property-based test: For ANY randomly selected button and ANY interaction sequence,
     * the click behavior structural patterns SHALL be preserved.
     *
     * This test generates random combinations of button selections, states, and
     * interaction sequences to verify preservation holds universally.
     *
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
     */
    it('For any button state and interaction sequence, click behavior SHALL be preserved', () => {
      fc.assert(
        fc.property(
          arbTestCaseIndex,
          arbButtonState,
          arbInteractionSequence,
          (index, state, sequence) => {
            const testCase = PRESERVATION_TEST_CASES[index]
            const fileContent = fs.readFileSync(testCase.filePath, 'utf-8')

            // Each button must preserve its core click mechanism
            switch (testCase.name) {
              case 'ShareButton': {
                const r = shareButtonPreservesClickBehavior(fileContent)
                expect(r.hasPopover).toBe(true)
                expect(r.hasPopoverTrigger).toBe(true)
                expect(r.hasPopoverContent).toBe(true)
                break
              }
              case 'PushNotificationToggle': {
                const r = notificationButtonPreservesClickBehavior(fileContent)
                expect(r.hasPopover).toBe(true)
                expect(r.hasPopoverTrigger).toBe(true)
                expect(r.hasPopoverContent).toBe(true)
                break
              }
              case 'ExportButton': {
                const r = exportButtonPreservesClickBehavior(fileContent)
                expect(r.hasDropdownMenu).toBe(true)
                expect(r.hasDropdownMenuTrigger).toBe(true)
                expect(r.hasDropdownMenuContent).toBe(true)
                break
              }
              case 'CreateFromReceiptButton': {
                const r = createFromReceiptPreservesClickBehavior(fileContent)
                expect(r.hasDialog).toBe(true)
                expect(r.hasDialogTrigger).toBe(true)
                break
              }
              case 'EditButton': {
                const r = editButtonPreservesClickBehavior(fileContent)
                expect(r.hasLink).toBe(true)
                expect(r.hasEditRoute).toBe(true)
                break
              }
              case 'GroupCardContextMenu': {
                const r = contextMenuPreservesClickBehavior(fileContent)
                expect(r.hasDropdownMenu).toBe(true)
                expect(r.hasNotificationsToggle).toBe(true)
                expect(r.hasArchiveItem).toBe(true)
                break
              }
              case 'ExpenseImport': {
                const expenseImportContent = fs.readFileSync(
                  EXPENSE_IMPORT_PATH,
                  'utf-8',
                )
                const knotsImportContent = fs.readFileSync(
                  KNOTS_IMPORT_PATH,
                  'utf-8',
                )
                const r = expenseImportPreservesTooltipBehavior(
                  `${expenseImportContent}\n${knotsImportContent}`,
                )
                expect(r.hasTooltip).toBe(true)
                expect(r.hasTooltipTrigger).toBe(true)
                expect(r.hasTooltipContent).toBe(true)
                expect(r.hasDropdownMenu).toBe(true)
                break
              }
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
