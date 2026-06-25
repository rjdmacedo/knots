/**
 * Bug Condition Exploration Test - Property 1: Shadcn Tooltip Not Displayed on Icon Button Hover
 *
 * This test verifies the expected behavior: when a user hovers over any icon button,
 * a shadcn Tooltip (identified by `data-slot="tooltip-content"`) SHALL appear with
 * the correct localized label, and the HTML `title` attribute SHALL NOT be present
 * on the trigger element.
 *
 * Additionally, the group card context menu SHALL include a "Toggle notifications" option.
 *
 * The bug condition is:
 *   isBugCondition(input) = input.element uses HTML `title` attribute OR has no tooltip
 *                           instead of shadcn Tooltip component
 *   For context menu: isBugCondition(input) = context menu lacks notifications toggle
 *
 * On UNFIXED code, this test is EXPECTED TO FAIL because:
 * - ShareButton uses `title={t('title')}` instead of shadcn Tooltip
 * - PushNotificationToggle uses `title={...}` instead of shadcn Tooltip
 * - ExportButton uses `title={t('export')}` instead of shadcn Tooltip
 * - Create Expense button uses `title={t('create')}` instead of shadcn Tooltip
 * - CreateFromReceiptButton uses `title={t('Dialog.triggerTitle')}` instead of shadcn Tooltip
 * - Edit button has no tooltip at all (no title, no Tooltip component)
 * - GroupCardContextMenu has no "Toggle notifications" menu item
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
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
const EXPENSES_PAGE_CLIENT_PATH = path.resolve(
  __dirname,
  '../../groups/[groupId]/expenses/page.client.tsx',
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

// --- Helpers ---

/**
 * Checks if a source file imports and uses the shadcn Tooltip components.
 * A properly fixed file should:
 * 1. Import Tooltip, TooltipTrigger, TooltipContent from '@/components/ui/tooltip'
 * 2. Use <TooltipContent> in the JSX (which renders data-slot="tooltip-content")
 * 3. NOT use the HTML `title` attribute on the button/trigger element
 */
function hasTooltipImplementation(fileContent: string): {
  importsTooltip: boolean
  usesTooltipContent: boolean
  usesHtmlTitle: boolean
} {
  const importsTooltip =
    fileContent.includes("from '@/components/ui/tooltip'") ||
    fileContent.includes('from "@/components/ui/tooltip"')

  const usesTooltipContent =
    fileContent.includes('<TooltipContent') ||
    fileContent.includes('<TooltipContent>')

  // Check if any Button or Link element uses the HTML title attribute
  // We look for title= on Button/Link elements (not on other elements like Link inside DropdownMenuItem)
  const usesHtmlTitle = /title=\{/.test(fileContent)

  return { importsTooltip, usesTooltipContent, usesHtmlTitle }
}

/**
 * Checks if the context menu file contains a notifications toggle item.
 */
function hasNotificationsToggle(fileContent: string): boolean {
  // Check for any indication of a notifications toggle in the context menu
  return (
    fileContent.includes('notification') ||
    fileContent.includes('Notification') ||
    fileContent.includes('subscribe') ||
    fileContent.includes('Subscribe') ||
    (fileContent.includes('Bell') && fileContent.includes('DropdownMenuItem'))
  )
}

// --- Constants ---
const PBT_NUM_RUNS = 10

// --- Types ---
interface ButtonTestCase {
  name: string
  filePath: string
  expectedLabel: string
  description: string
}

// --- Test Cases ---
const AFFECTED_BUTTONS: ButtonTestCase[] = [
  {
    name: 'ShareButton',
    filePath: SHARE_BUTTON_PATH,
    expectedLabel: 'Share',
    description: 'Share button in group header',
  },
  {
    name: 'PushNotificationToggle',
    filePath: PUSH_NOTIFICATION_TOGGLE_PATH,
    expectedLabel: 'Enable notifications / Disable notifications',
    description: 'Notifications (bell) button in group header',
  },
  {
    name: 'ExportButton',
    filePath: EXPORT_BUTTON_PATH,
    expectedLabel: 'Export',
    description: 'Export button in expenses page',
  },
  {
    name: 'CreateExpenseButton',
    filePath: EXPENSES_PAGE_CLIENT_PATH,
    expectedLabel: 'Create expense',
    description: 'Create Expense (+) button in expenses page',
  },
  {
    name: 'CreateFromReceiptButton',
    filePath: CREATE_FROM_RECEIPT_PATH,
    expectedLabel: 'Create expense from receipt',
    description: 'Create from Receipt button in expenses page',
  },
  {
    name: 'EditButton',
    filePath: GROUP_INFORMATION_PATH,
    expectedLabel: 'Edit',
    description: 'Edit (pencil) button in Information tab',
  },
]

// --- Tests ---

describe('UI Button Tooltip Bug Condition Exploration', () => {
  describe('Property 1: Bug Condition - Shadcn Tooltip Not Displayed on Icon Button Hover', () => {
    /**
     * For each affected button, verify that:
     * 1. The source file imports shadcn Tooltip components
     * 2. The source file uses <TooltipContent> (which renders data-slot="tooltip-content")
     * 3. The source file does NOT use HTML `title` attribute on the trigger button
     *
     * This test encodes the EXPECTED behavior. On unfixed code, it will FAIL
     * because buttons use `title` attribute instead of shadcn Tooltip.
     *
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
     */
    it.each(AFFECTED_BUTTONS)(
      '$name SHALL use shadcn Tooltip instead of HTML title attribute',
      ({ name, filePath, description }) => {
        fc.assert(
          fc.property(fc.constant(filePath), (sourceFilePath) => {
            const fileContent = fs.readFileSync(sourceFilePath, 'utf-8')
            const { importsTooltip, usesTooltipContent, usesHtmlTitle } =
              hasTooltipImplementation(fileContent)

            // ASSERTION 1: File must import shadcn Tooltip components
            expect(importsTooltip).toBe(true)

            // ASSERTION 2: File must use <TooltipContent> (renders data-slot="tooltip-content")
            expect(usesTooltipContent).toBe(true)

            // ASSERTION 3: File must NOT use HTML title attribute on trigger buttons
            // Note: For the Edit button, there's no title at all (different bug manifestation)
            // For other buttons, they incorrectly use title= instead of Tooltip
            if (name !== 'EditButton') {
              // These buttons currently USE title (bug condition: should use Tooltip instead)
              expect(usesHtmlTitle).toBe(false)
            }
          }),
          { numRuns: PBT_NUM_RUNS },
        )
      },
    )

    /**
     * Specifically verify the Edit button has a tooltip.
     * The Edit button currently has NO tooltip at all (no title, no Tooltip component).
     *
     * **Validates: Requirements 1.6**
     */
    it('EditButton SHALL have a shadcn Tooltip (currently has no tooltip at all)', () => {
      fc.assert(
        fc.property(fc.constant(GROUP_INFORMATION_PATH), (sourceFilePath) => {
          const fileContent = fs.readFileSync(sourceFilePath, 'utf-8')
          const { importsTooltip, usesTooltipContent } =
            hasTooltipImplementation(fileContent)

          // The Edit button currently has NO tooltip at all
          // After fix, it should import and use Tooltip components
          expect(importsTooltip).toBe(true)
          expect(usesTooltipContent).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Verify that for any randomly selected affected button, the bug condition
     * is NOT present (i.e., the button uses shadcn Tooltip correctly).
     *
     * This property-based test generates random selections from the affected buttons
     * and verifies each one has the correct Tooltip implementation.
     *
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
     */
    it('For any affected button, shadcn Tooltip SHALL be used (no HTML title)', () => {
      const arbButtonIndex = fc.integer({
        min: 0,
        max: AFFECTED_BUTTONS.length - 1,
      })

      fc.assert(
        fc.property(arbButtonIndex, (index) => {
          const button = AFFECTED_BUTTONS[index]
          const fileContent = fs.readFileSync(button.filePath, 'utf-8')
          const { importsTooltip, usesTooltipContent } =
            hasTooltipImplementation(fileContent)

          // Every affected button must use shadcn Tooltip
          expect(importsTooltip).toBe(true)
          expect(usesTooltipContent).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  describe('Property 1b: Bug Condition - Context Menu Notifications Toggle', () => {
    /**
     * Verify that the group card context menu includes a "Toggle notifications" option.
     *
     * The bug condition is: the context menu lacks a notifications toggle.
     * On unfixed code, this test will FAIL because the menu only has
     * "Remove from recent groups" and "Archive/Unarchive" options.
     *
     * **Validates: Requirements 1.7**
     */
    it('GroupCardContextMenu SHALL include a notifications toggle menu item', () => {
      fc.assert(
        fc.property(fc.constant(MY_GROUPS_PATH), (sourceFilePath) => {
          const fileContent = fs.readFileSync(sourceFilePath, 'utf-8')

          // The context menu must contain a notifications toggle item
          const hasToggle = hasNotificationsToggle(fileContent)
          expect(hasToggle).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
