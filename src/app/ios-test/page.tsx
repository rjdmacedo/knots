import { ExpenseFormTest } from '@/app/groups/[groupId]/expenses/expense-form-test'

export const metadata = {
  title: 'iOS Viewport Test',
}

export default function IosTestPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <ExpenseFormTest />
    </div>
  )
}
