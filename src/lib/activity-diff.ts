export interface FieldChange {
  field: string
  oldValue: string | null
  newValue: string | null
}

/**
 * Serializes a value to a string for comparison and storage.
 * - null/undefined → null
 * - Date → ISO string
 * - Array → JSON string
 * - number/boolean/string → String(value)
 */
function serialize(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}

/**
 * Computes field-level differences between an existing group (from DB)
 * and updated form values being submitted.
 */
export function computeGroupChanges(
  existing: {
    name: string
    information: string | null
    currency: string
    simplifyDebts?: boolean
  },
  updated: {
    name: string
    information?: string
    currency: string
    simplifyDebts?: boolean
  },
): FieldChange[] {
  const changes: FieldChange[] = []

  if (existing.name !== updated.name) {
    changes.push({
      field: 'name',
      oldValue: existing.name,
      newValue: updated.name,
    })
  }

  if ((existing.information ?? '') !== (updated.information ?? '')) {
    changes.push({
      field: 'information',
      oldValue: existing.information ?? null,
      newValue: updated.information ?? null,
    })
  }

  if (existing.currency !== updated.currency) {
    changes.push({
      field: 'currency',
      oldValue: existing.currency,
      newValue: updated.currency,
    })
  }

  if (
    existing.simplifyDebts !== undefined &&
    updated.simplifyDebts !== undefined &&
    existing.simplifyDebts !== updated.simplifyDebts
  ) {
    changes.push({
      field: 'simplifyDebts',
      oldValue: String(existing.simplifyDebts),
      newValue: String(updated.simplifyDebts),
    })
  }

  return changes
}

/**
 * Computes field-level differences between an existing expense (from DB)
 * and updated form values being submitted.
 */
export function computeExpenseChanges(
  existing: {
    title: string
    amount: number
    expenseDate: Date
    categoryId: number
    paidById: string
    splitMode: string
    isReimbursement: boolean
    notes?: string | null
    recurrenceRule?: string | null
    paidFor: Array<{ userId: string }>
  },
  updated: {
    title: string
    amount: number
    expenseDate: Date
    category: number
    paidBy: string
    splitMode: string
    isReimbursement: boolean
    notes?: string | null
    recurrenceRule?: string | null
    paidFor: Array<{ participant: string }>
  },
): FieldChange[] {
  const changes: FieldChange[] = []

  const trackedFields: Array<{
    field: string
    oldVal: unknown
    newVal: unknown
  }> = [
    { field: 'title', oldVal: existing.title, newVal: updated.title },
    { field: 'amount', oldVal: existing.amount, newVal: updated.amount },
    {
      field: 'expenseDate',
      oldVal: existing.expenseDate,
      newVal: updated.expenseDate,
    },
    {
      field: 'category',
      oldVal: existing.categoryId,
      newVal: updated.category,
    },
    { field: 'paidBy', oldVal: existing.paidById, newVal: updated.paidBy },
    {
      field: 'splitMode',
      oldVal: existing.splitMode,
      newVal: updated.splitMode,
    },
    {
      field: 'isReimbursement',
      oldVal: existing.isReimbursement,
      newVal: updated.isReimbursement,
    },
    {
      field: 'notes',
      oldVal: existing.notes || null,
      newVal: updated.notes || null,
    },
    {
      field: 'recurrenceRule',
      oldVal: existing.recurrenceRule || null,
      newVal: updated.recurrenceRule || null,
    },
  ]

  for (const { field, oldVal, newVal } of trackedFields) {
    const oldSerialized = serialize(oldVal)
    const newSerialized = serialize(newVal)

    if (oldSerialized !== newSerialized) {
      changes.push({
        field,
        oldValue: oldSerialized,
        newValue: newSerialized,
      })
    }
  }

  // Track paidFor changes (participants involved in split)
  const oldPaidFor = existing.paidFor.map((p) => p.userId).sort()
  const newPaidFor = updated.paidFor.map((p) => p.participant).sort()

  if (JSON.stringify(oldPaidFor) !== JSON.stringify(newPaidFor)) {
    changes.push({
      field: 'paidFor',
      oldValue: JSON.stringify(oldPaidFor),
      newValue: JSON.stringify(newPaidFor),
    })
  }

  return changes
}
