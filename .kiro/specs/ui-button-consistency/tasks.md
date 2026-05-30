# Implementation Plan

## Overview

Fix UI button tooltip inconsistency by standardizing all icon buttons to use the shadcn Tooltip component and adding the missing "Toggle notifications" option to the group card context menu. The workflow follows the bug condition methodology: explore the bug, preserve existing behavior, implement the fix, and validate.

## Tasks

- [x] 1. Write bug condition exploration test

  - **Property 1: Bug Condition** - Shadcn Tooltip Not Displayed on Icon Button Hover
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For each affected button (Share, Notifications, Export, Create Expense, Create from Receipt, Edit), render the component, simulate hover, and assert that a `[data-slot="tooltip-content"]` element appears with the correct localized label. Also render the group card context menu and assert a "Toggle notifications" item exists.
  - Test that `isBugCondition(input)` holds: buttons use HTML `title` attribute or have no tooltip instead of shadcn Tooltip, and context menu lacks notifications toggle
  - Assertions should match Expected Behavior: `data-slot="tooltip-content"` is rendered on hover with correct label text, and `title` attribute is NOT present on the trigger element
  - For the context menu: assert a notifications toggle menu item is present when the menu is opened
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists for all affected buttons)
  - Document counterexamples found: e.g., "ShareButton renders `title='Share'` instead of shadcn Tooltip", "EditButton has no tooltip at all", "GroupCardContextMenu has no notifications toggle item"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)

  - **Property 2: Preservation** - Click Behavior Unchanged for All Buttons
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: clicking Share button opens share popover with group URL
  - Observe on UNFIXED code: clicking Notifications button opens notification dropdown with subscribe/unsubscribe options
  - Observe on UNFIXED code: clicking Export button opens export dropdown with JSON and CSV options
  - Observe on UNFIXED code: clicking Create Expense (+) button navigates to expense creation page
  - Observe on UNFIXED code: clicking Create from Receipt button opens receipt scanning dialog/drawer
  - Observe on UNFIXED code: clicking Edit button navigates to group edit page
  - Observe on UNFIXED code: clicking "Remove from recent groups" and "Archive group" in context menu performs those actions
  - Observe on UNFIXED code: hovering Splitwise Import button displays its shadcn Tooltip correctly
  - Write property-based tests: for all button states (loading, disabled, active) and interaction sequences (hover then click, click without hover), click behavior produces the same result as observed on unfixed code
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix for UI button tooltip inconsistency and missing context menu notifications toggle

  - [x] 3.1 Wrap ShareButton with shadcn Tooltip

    - Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
    - Wrap `PopoverTrigger` button with `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{label}</TooltipContent></Tooltip>`
    - Remove HTML `title` attribute from the Button
    - File: `src/app/groups/[groupId]/share-button.tsx`
    - _Bug_Condition: isBugCondition({ element: ShareButton, action: 'hover' }) — button uses title attribute instead of shadcn Tooltip_
    - _Expected_Behavior: shadcn Tooltip with localized label displayed on hover, no HTML title attribute_
    - _Preservation: Click must continue to open share popover with group URL_
    - _Requirements: 2.1, 3.1_

  - [x] 3.2 Wrap PushNotificationToggle with shadcn Tooltip

    - Import Tooltip components
    - Wrap `DropdownMenuTrigger` button with Tooltip
    - Remove HTML `title` attribute from the Button
    - File: `src/components/push-notification-toggle.tsx`
    - _Bug_Condition: isBugCondition({ element: NotificationsButton, action: 'hover' }) — button uses title attribute instead of shadcn Tooltip_
    - _Expected_Behavior: shadcn Tooltip with localized subscribe/unsubscribe label displayed on hover_
    - _Preservation: Click must continue to open notification dropdown with subscribe/unsubscribe and participant selection_
    - _Requirements: 2.2, 3.2_

  - [x] 3.3 Wrap ExportButton with shadcn Tooltip

    - Import Tooltip components
    - Wrap `DropdownMenuTrigger` button with Tooltip
    - Remove HTML `title` attribute from the Button
    - File: `src/app/groups/[groupId]/export-button.tsx`
    - _Bug_Condition: isBugCondition({ element: ExportButton, action: 'hover' }) — button uses title attribute instead of shadcn Tooltip_
    - _Expected_Behavior: shadcn Tooltip with localized "Export" label displayed on hover_
    - _Preservation: Click must continue to open export dropdown with JSON and CSV options_
    - _Requirements: 2.3, 3.3_

  - [x] 3.4 Wrap Create Expense button with shadcn Tooltip

    - Import Tooltip components
    - Wrap the Create Expense Link/Button with `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{label}</TooltipContent></Tooltip>`
    - Remove HTML `title` attribute from the Link
    - File: `src/app/groups/[groupId]/expenses/page.client.tsx`
    - _Bug_Condition: isBugCondition({ element: CreateExpenseButton, action: 'hover' }) — button uses title attribute instead of shadcn Tooltip_
    - _Expected_Behavior: shadcn Tooltip with localized "Create expense" label displayed on hover_
    - _Preservation: Click must continue to navigate to expense creation page_
    - _Requirements: 2.4, 3.4_

  - [x] 3.5 Wrap CreateFromReceiptButton with shadcn Tooltip

    - Import Tooltip components
    - Wrap the trigger Button with Tooltip (button is passed as `trigger` prop to Dialog/Drawer)
    - Remove HTML `title` attribute from the Button
    - File: `src/app/groups/[groupId]/expenses/create-from-receipt-button.tsx`
    - _Bug_Condition: isBugCondition({ element: CreateFromReceiptButton, action: 'hover' }) — button uses title attribute instead of shadcn Tooltip_
    - _Expected_Behavior: shadcn Tooltip with localized label displayed on hover_
    - _Preservation: Click must continue to open receipt scanning dialog/drawer_
    - _Requirements: 2.5, 3.5_

  - [x] 3.6 Add Tooltip to Edit button in GroupInformation

    - Import Tooltip components
    - Wrap the Edit Button/Link with `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{t('edit')}</TooltipContent></Tooltip>`
    - Add localized "Edit" label using the translation function
    - File: `src/app/groups/[groupId]/information/group-information.tsx`
    - _Bug_Condition: isBugCondition({ element: EditButton, action: 'hover' }) — button has no tooltip at all_
    - _Expected_Behavior: shadcn Tooltip with localized "Edit" label displayed on hover_
    - _Preservation: Click must continue to navigate to group edit page_
    - _Requirements: 2.6, 3.6_

  - [x] 3.7 Add "Toggle notifications" option to group card context menu

    - Import notification-related dependencies (push notification subscription logic or simplified toggle action)
    - Add "Toggle notifications" `DropdownMenuItem` in the `<DropdownMenuContent>`
    - Handle push notification state: toggle all notifications for the group (no participant granularity)
    - File: `src/app/groups/recent-group-list-card.tsx`
    - _Bug_Condition: isBugCondition({ element: GroupCardContextMenu, action: 'open' }) — context menu lacks notifications toggle_
    - _Expected_Behavior: "Toggle notifications" menu item present that enables/disables push notifications for the group_
    - _Preservation: "Remove from recent groups" and "Archive group" must continue to work as before_
    - _Requirements: 2.7, 3.7_

  - [x] 3.8 Verify bug condition exploration test now passes

    - **Property 1: Expected Behavior** - Shadcn Tooltip Displayed on Icon Button Hover
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed for all affected buttons)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Click Behavior Unchanged for All Buttons
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in click behavior)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite to confirm no regressions
  - Verify bug condition exploration test passes (Property 1)
  - Verify preservation property tests pass (Property 2)
  - Ensure all other existing tests continue to pass
  - Ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["3.8", "3.9"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks 3.1 through 3.7 (implementation sub-tasks) can be executed in parallel since they modify independent files
- Task 3.8 and 3.9 must run after all implementation sub-tasks are complete
- The exploration test (task 1) is expected to FAIL on unfixed code — this is correct behavior that confirms the bug exists
- The preservation tests (task 2) are expected to PASS on unfixed code — this confirms baseline behavior
- The reference implementation for the Tooltip pattern is the Splitwise Import button
