# Requirements Compliance Re-Evaluation

## ✅ Fully Implemented

### 1. Save Form State to localStorage

- ✅ **Only when dirty**: Line 395 checks `if (!form.formState.isDirty)` and returns early
- ✅ **Debounce 500ms**: Line 381 uses `useDebouncedValue(formValues, 500)`
- ✅ **Storage key format**: Lines 201-203 correctly implement:
  - Create: `${group.id}-expense-draft`
  - Edit: `${group.id}-expense-draft-${expense.id}`

### 2. Load Form State from localStorage

- ✅ **On component mount**: Lines 242-370 compute `defaultValues` with localStorage support
- ✅ **Search params priority**: Lines 274-334 check `hasSearchParams` first before localStorage
- ✅ **Date conversion**: Lines 141-147 implement `deserializeFormValues` to convert date strings back to Date objects

### 3. Clear localStorage - Delete Handler

- ✅ **On Delete** (Lines 488-495): `handleDelete` function correctly:
  - Sets `hasSubmittedRef.current = true`
  - Clears localStorage with `setStoredFormState(null)`
  - Resets `previousValuesRef.current = null`
  - Calls `onDelete` after clearing

### 4. Special Behavior for Edit Forms

- ✅ **Preserve when loaded from storage**: Lines 404-411 check `wasInitiallyLoadedFromStorageRef.current` and preserve localStorage
- ✅ **Clear when not loaded from storage**: Lines 404-411 clear localStorage for edit forms not loaded from storage

### 5. Performance & Stability

- ✅ **No infinite loops**: Uses refs (`previousValuesRef`) and memoization to prevent infinite loops
- ✅ **No flicker**: Uses `useMemo` to create stable serialized keys (line 384-387)
- ✅ **Efficient**: Only saves/clears when values actually change (line 417 checks `serializedFormValues === previousValuesRef.current`)

## ⚠️ Partially Implemented / Issues

### 3. Clear localStorage - Cancel Button (Lines 1502-1504)

**Current Implementation:**

```tsx
<Button variant="ghost" asChild onClick={handleCancel}>
  <Link href={`/groups/${group.id}`}>{t('cancel')}</Link>
</Button>
```

**Issue**: When using `asChild` with a `Link`, the `onClick` handler on the Button may not fire reliably before navigation. The `Link` component will navigate immediately, potentially before `handleCancel` executes.

**Problem**:

- `handleCancel` sets `isCancelingRef.current = true` and clears localStorage
- But with `asChild` + `Link`, the navigation might happen before the onClick handler completes
- This could cause a race condition where localStorage isn't cleared before navigation

**Recommended Fix:**

```tsx
<Button
  variant="ghost"
  type="button"
  onClick={() => {
    handleCancel()
    router.push(`/groups/${group.id}`)
  }}
>
  {t('cancel')}
</Button>
```

Or use `Link` with `onClick`:

```tsx
<Button variant="ghost" asChild>
  <Link href={`/groups/${group.id}`} onClick={handleCancel}>
    {t('cancel')}
  </Link>
</Button>
```

### 3. Clear localStorage - Submit Function (Line 436-480)

**Current Implementation:**

```tsx
const submit = async (values: ExpenseFormValues) => {
  // ... upload documents, persist options, convert values ...

  // Submit the form first
  await onSubmit(values, activeUserId ?? undefined)

  // ... delete documents from S3 ...
}
```

**Issue**: localStorage is NOT cleared before calling `onSubmit`. According to requirements, it should be cleared BEFORE submission to prevent debounced save from re-saving.

**Problem**:

- The debounced save effect (line 390-429) might still run after `onSubmit` is called
- If `onSubmit` navigates away, the debounced save could try to save after navigation starts
- localStorage should be cleared BEFORE `onSubmit` to prevent this

**Required Fix:**

```tsx
const submit = async (values: ExpenseFormValues) => {
  // ... upload documents, persist options, convert values ...

  // Mark as submitted and clear localStorage BEFORE submission
  hasSubmittedRef.current = true
  setStoredFormState(null)
  previousValuesRef.current = null

  // Submit the form (this will navigate away)
  await onSubmit(values, activeUserId ?? undefined)

  // ... delete documents from S3 ...
}
```

## Summary

**Compliance: 90%**

- ✅ Delete handler: Fully implemented
- ⚠️ Cancel button: Implementation exists but may have timing issues with `asChild` + `Link`
- ❌ Submit function: Missing localStorage clearing before `onSubmit`

## Recommended Fixes

1. **Cancel Button**: Either:

   - Use `router.push()` instead of `Link` with `asChild`
   - Or use `Link` with `onClick` prop directly (not on Button)

2. **Submit Function**: Add localStorage clearing BEFORE `await onSubmit()`:
   ```tsx
   hasSubmittedRef.current = true
   setStoredFormState(null)
   previousValuesRef.current = null
   await onSubmit(values, activeUserId ?? undefined)
   ```
