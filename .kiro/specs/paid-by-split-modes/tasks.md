# Implementation Plan: paid-by-split-modes

## Overview

Spliit-style Paid by Choice Cards on top of the existing multi-payer amount array. UI modes compute absolute amounts; no schema migration.

## Tasks

- [x] 1. Digit-aware distribution helper
  - [x] 1.1 Create `src/lib/distribute-amount.ts` with `distributeEqualAmounts` and `distributeWeightedAmounts`
  - [x] 1.2 Unit tests in `src/lib/distribute-amount.test.ts`
    - _Requirements: 4.1, 4.2_

- [x] 2. i18n for Paid by modes
  - [x] 2.1 Add `Expenses.paidBy` keys for section labels, mode titles, and descriptions to all locale files
    - _Requirements: 6.1, 6.2_

- [x] 3. Rewrite PayerSelector
  - [x] 3.1 Compose Choice Cards with `Field` + `RadioGroup` (Single + Multiple modes)
  - [x] 3.2 Implement mode behaviors (evenly / shares / percentage / amount) emitting `paidBy` amounts
  - [x] 3.3 Honor `singlePayerOnly` and `isReimbursement` (Single only)
  - [x] 3.4 Infer initial mode from `value.length` (1 → single, else → by_amount)
    - _Requirements: 1.1–1.4, 2.1–2.7, 3.1–3.3_

- [x] 4. Wire form / floating create
  - [x] 4.1 Ensure ExpenseForm passes `singlePayerOnly` for friend/hybrid paths
  - [x] 4.2 Keep single-payer amount sync with expense total on the form
    - _Requirements: 5.1, 5.2_

- [x] 5. Tests and checkpoint
  - [x] 5.1 Confirm helper tests + schema still pass; typecheck clean
    - _Requirements: 4.2_
