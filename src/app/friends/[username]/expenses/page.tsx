import { Metadata } from 'next'
import { FriendTimelineWrapper } from '../friend-timeline-wrapper'

export const metadata: Metadata = {
  title: 'Expenses',
}

export default function FriendExpensesPage() {
  return <FriendTimelineWrapper />
}
