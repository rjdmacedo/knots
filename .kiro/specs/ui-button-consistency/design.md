# UI Button Consistency Bugfix Design

## Overview

Icon buttons across the application use inconsistent tooltip implementations. The "Import from Splitwise" button correctly uses the shadcn `Tooltip`/`TooltipTrigger`/`TooltipContent` components, while all other icon buttons (Share, Notifications, Export, Create Expense, Create from Receipt, Edit) rely on the native HTML `title` attribute or have no tooltip at all. Additionally, the group card context menu is missing a "Toggle notifications" option. The fix standardizes all icon buttons to use the shadcn Tooltip component and adds the missing context menu item.

## Glossary

- **Bug_Condition (C)**: An icon button that uses the HTML `title` attribute or has no tooltip instead of the shadcn Tooltip component, OR the group card context menu missing the notifications toggle option
- **Property (P)**: All icon buttons display a shadcn Tooltip on hover with the correct localized label, and the group card context menu includes a notifications toggle option
- **Preservation**: Existing click behavior (popovers, dropdowns, navigation, dialogs) must remain unchanged after wrapping buttons with Tooltip
- **shadcn Tooltip**: The `Tooltip`/`TooltipTrigger`/`TooltipContent` component set from `@/components/ui/tooltip` based on Radix UI primitives
- **TooltipProvider**: A Radix UI context provider (already embedded in the `Tooltip` component with `delayDuration=0`)

## Bug Details

### Bug Condition

The bug manifests when a user hovers over any icon button other than the Splitwise Import button. Instead of seeing a styled shadcn Tooltip (consistent with the design system), the user either sees a native browser tooltip (from the HTML `title` attribute) or no tooltip at all. Additionally, the group card context menu lacks a notification toggle option.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { element: IconButton | ContextMenu, action: 'hover' | 'open' }
  OUTPUT: boolean

  IF input.action == 'hover' THEN
    RETURN input.element IN [ShareButton, NotificationsButton, ExportButton,
                             CreateExpenseButton, CreateFromReceiptButton, EditButton]
           AND (input.element.hasAttribute('title') OR NOT input.element.hasTooltip())
           AND NOT input.element.isWrappedWith(ShadcnTooltip)
  ELSE IF input.action == 'open' AND input.element == GroupCardContextMenu THEN
    RETURN NOT contextMenuContains('ToggleNotifications')
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Share button hover**: User hovers → native browser tooltip "Share" appears (yellow/system-styled) instead of shadcn Tooltip (styled popover with arrow)
- **Notifications button hover**: User hovers → native browser tooltip "Subscribe"/"Unsubscribe" appears instead of shadcn Tooltip
- **Export button hover**: User hovers → native browser tooltip "Export" appears instead of shadcn Tooltip
- **Create Expense button hover**: User hovers → native browser tooltip "Create expense" appears instead of shadcn Tooltip
- **Create from Receipt button hover**: User hovers → native browser tooltip with trigger title appears instead of shadcn Tooltip
- **Edit button hover**: User hovers → no tooltip appears at all (no `title` attribute, no shadcn Tooltip)
- **Group card context menu open**: User opens menu → only "Remove from recent groups" and "Archive/Unarchive" options shown, no notifications toggle

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Clicking the Share button must continue to open the share popover with the group URL
- Clicking the Notifications button must continue to open the notification dropdown with subscribe/unsubscribe and participant selection options
- Clicking the Export button must continue to open the export dropdown with JSON and CSV options
- Clicking the Create Expense (+) button must continue to navigate to the expense creation page
- Clicking the Create from Receipt button must continue to open the receipt scanning dialog/drawer
- Clicking the Edit button must continue to navigate to the group edit page
- Clicking "Remove from recent groups" or "Archive group" in the context menu must continue to perform those actions
- The Splitwise Import button must continue to display its shadcn Tooltip correctly

**Scope:**
All interactions that do NOT involve hovering over the affected icon buttons or opening the group card context menu should be completely unaffected by this fix. This includes:

- All click/tap interactions on the affected buttons
- Keyboard navigation and activation of buttons
- Visual appearance and layout of buttons
- All other components and pages in the application

## Hypothesized Root Cause

Based on the code analysis, the root causes are:

1. **Inconsistent Implementation Pattern**: The Splitwise Import button was implemented with the shadcn Tooltip pattern (`<Tooltip><TooltipTrigger asChild>...<TooltipContent>...</TooltipContent></Tooltip>`), but other buttons were implemented at different times without following this pattern. They used the simpler HTML `title` attribute as a shortcut.

2. **No Shared Wrapper Component**: There is no reusable "icon button with tooltip" component that enforces the shadcn Tooltip pattern. Each button was implemented independently.

3. **Missing Feature in Context Menu**: The group card context menu (`recent-group-list-card.tsx`) was built before the push notification feature was added to the group header. The notification toggle was never backported to the context menu.

4. **Tooltip + Trigger Composition Complexity**: Some buttons are already wrapped in `Popover`, `DropdownMenu`, or `Dialog` triggers. Developers may have avoided adding Tooltip wrappers due to perceived complexity of nesting Radix UI primitives (though the Splitwise Import button demonstrates this works correctly with `asChild` prop composition).

## Correctness Properties

Property 1: Bug Condition - Shadcn Tooltip Displayed on Icon Button Hover

_For any_ icon button where the bug condition holds (isBugCondition returns true for hover action), the fixed component SHALL render a shadcn `Tooltip`/`TooltipTrigger`/`TooltipContent` wrapper that displays the correct localized label text on hover, and SHALL NOT use the HTML `title` attribute.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Bug Condition - Context Menu Notifications Toggle

_For any_ group card context menu where the bug condition holds (isBugCondition returns true for open action), the fixed component SHALL include a "Toggle notifications" menu item that enables or disables push notifications for that group.

**Validates: Requirements 2.7**

Property 3: Preservation - Click Behavior Unchanged

_For any_ interaction that is NOT a hover over the affected icon buttons (clicks, taps, keyboard activation), the fixed components SHALL produce exactly the same behavior as the original components, preserving all existing click handlers, navigation, popovers, dropdowns, and dialogs.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/groups/[groupId]/share-button.tsx`

**Function**: `ShareButton`

**Specific Changes**:

1. **Import Tooltip components**: Add `import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'`
2. **Wrap PopoverTrigger with Tooltip**: Nest `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{label}</TooltipContent></Tooltip>` around the `<PopoverTrigger>` button
3. **Remove `title` attribute**: Remove the HTML `title` prop from the Button

---

**File**: `src/components/push-notification-toggle.tsx`

**Function**: `PushNotificationToggle`

**Specific Changes**:

1. **Import Tooltip components**: Add Tooltip imports
2. **Wrap DropdownMenuTrigger with Tooltip**: Nest Tooltip around the trigger button
3. **Remove `title` attribute**: Remove the HTML `title` prop from the Button

---

**File**: `src/app/groups/[groupId]/export-button.tsx`

**Function**: `ExportButton`

**Specific Changes**:

1. **Import Tooltip components**: Add Tooltip imports
2. **Wrap DropdownMenuTrigger with Tooltip**: Nest Tooltip around the trigger button
3. **Remove `title` attribute**: Remove the HTML `title` prop from the Button

---

**File**: `src/app/groups/[groupId]/expenses/page.client.tsx`

**Function**: Expenses page client component (Create Expense button)

**Specific Changes**:

1. **Import Tooltip components**: Add Tooltip imports
2. **Wrap the Create Expense Link/Button with Tooltip**: Add `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{label}</TooltipContent></Tooltip>`
3. **Remove `title` attribute**: Remove the HTML `title` prop from the Link

---

**File**: `src/app/groups/[groupId]/expenses/create-from-receipt-button.tsx`

**Function**: `CreateFromReceiptButton`

**Specific Changes**:

1. **Import Tooltip components**: Add Tooltip imports
2. **Wrap the trigger Button with Tooltip**: The button is passed as a `trigger` prop to Dialog/Drawer — wrap it with Tooltip
3. **Remove `title` attribute**: Remove the HTML `title` prop from the Button

---

**File**: `src/app/groups/[groupId]/information/group-information.tsx`

**Function**: `GroupInformation`

**Specific Changes**:

1. **Import Tooltip components**: Add Tooltip imports
2. **Wrap the Edit Button/Link with Tooltip**: Add `<Tooltip><TooltipTrigger asChild>...<TooltipContent>{t('edit')}</TooltipContent></Tooltip>`
3. **Add localized "Edit" label**: Use the translation function for the tooltip content

---

**File**: `src/app/groups/recent-group-list-card.tsx`

**Function**: `RecentGroupListCard`

**Specific Changes**:

1. **Import notification-related dependencies**: Add imports for push notification subscription logic or a simplified toggle action
2. **Add "Toggle notifications" DropdownMenuItem**: Insert a new menu item in the `<DropdownMenuContent>` that calls the subscribe/unsubscribe logic for the group
3. **Handle push notification state**: Either reuse logic from `PushNotificationToggle` or create a simplified version that toggles all notifications for the group without participant granularity

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write component tests that render each affected button and assert that a shadcn Tooltip (identified by `data-slot="tooltip-content"`) appears on hover. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Share Button Tooltip Test**: Render ShareButton, simulate hover, assert `data-slot="tooltip-content"` element appears (will fail on unfixed code)
2. **Notifications Button Tooltip Test**: Render PushNotificationToggle, simulate hover, assert tooltip content appears (will fail on unfixed code)
3. **Export Button Tooltip Test**: Render ExportButton, simulate hover, assert tooltip content appears (will fail on unfixed code)
4. **Create Expense Button Tooltip Test**: Render expenses page, simulate hover on + button, assert tooltip content appears (will fail on unfixed code)
5. **Create from Receipt Button Tooltip Test**: Render CreateFromReceiptButton, simulate hover, assert tooltip content appears (will fail on unfixed code)
6. **Edit Button Tooltip Test**: Render GroupInformation, simulate hover on edit button, assert tooltip content appears (will fail on unfixed code)
7. **Context Menu Notifications Test**: Render RecentGroupListCard, open context menu, assert "Toggle notifications" item exists (will fail on unfixed code)

**Expected Counterexamples**:

- No `data-slot="tooltip-content"` element rendered on hover for any of the affected buttons
- No "Toggle notifications" menu item in the group card context menu
- Possible causes: buttons use HTML `title` instead of Tooltip component, Edit button has no tooltip at all, context menu never had the feature

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL button IN [ShareButton, NotificationsButton, ExportButton,
                   CreateExpenseButton, CreateFromReceiptButton, EditButton] DO
  rendered := render(button)
  simulateHover(rendered.triggerElement)
  ASSERT rendered.querySelector('[data-slot="tooltip-content"]') IS NOT NULL
  ASSERT rendered.querySelector('[data-slot="tooltip-content"]').textContent == expectedLabel(button)
  ASSERT rendered.triggerElement.getAttribute('title') IS NULL
END FOR

FOR contextMenu IN [GroupCardContextMenu] DO
  rendered := render(contextMenu)
  openMenu(rendered)
  ASSERT rendered.querySelector('ToggleNotificationsItem') IS NOT NULL
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL button IN [ShareButton, NotificationsButton, ExportButton,
                   CreateExpenseButton, CreateFromReceiptButton, EditButton] DO
  rendered := render(button_fixed)
  simulateClick(rendered.triggerElement)
  ASSERT clickBehavior(button_fixed) == clickBehavior(button_original)
END FOR

FOR contextMenu IN [GroupCardContextMenu] DO
  rendered := render(contextMenu_fixed)
  ASSERT menuItem('removeRecent').onClick == originalBehavior('removeRecent')
  ASSERT menuItem('archive').onClick == originalBehavior('archive')
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many interaction sequences automatically
- It catches edge cases where Tooltip wrappers might interfere with existing Radix UI primitives
- It provides strong guarantees that click behavior is unchanged across all button states

**Test Plan**: Observe behavior on UNFIXED code first for click interactions, then write tests capturing that behavior.

**Test Cases**:

1. **Share Button Click Preservation**: Verify clicking opens the share popover with group URL
2. **Notifications Button Click Preservation**: Verify clicking opens the notification dropdown
3. **Export Button Click Preservation**: Verify clicking opens the export dropdown with JSON/CSV options
4. **Create Expense Click Preservation**: Verify clicking navigates to expense creation page
5. **Create from Receipt Click Preservation**: Verify clicking opens the receipt scanning dialog/drawer
6. **Edit Button Click Preservation**: Verify clicking navigates to the group edit page
7. **Context Menu Existing Items Preservation**: Verify "Remove from recent" and "Archive" continue to work

### Unit Tests

- Test each button renders a shadcn Tooltip with correct localized label on hover
- Test that HTML `title` attributes are removed from all affected buttons
- Test that the Edit button (previously no tooltip) now has a tooltip
- Test that the context menu includes the notifications toggle item
- Test that the notifications toggle item calls the correct subscribe/unsubscribe logic

### Property-Based Tests

- Generate random button states (loading, disabled, active) and verify tooltip still appears on hover
- Generate random group configurations and verify context menu always includes notifications toggle
- Generate random interaction sequences (hover then click, click without hover) and verify click behavior is preserved

### Integration Tests

- Test full flow: hover Share button → see tooltip → click → popover opens with URL
- Test full flow: hover Notifications button → see tooltip → click → dropdown opens
- Test full flow: hover Export button → see tooltip → click → dropdown with JSON/CSV opens
- Test full flow: open group card context menu → click "Toggle notifications" → notification state changes
- Test that Splitwise Import button tooltip continues to work alongside the new tooltips
