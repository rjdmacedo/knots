import { Metadata } from 'next'
import { FriendSettingsView } from '../friend-settings-view'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function FriendSettingsPage() {
  return <FriendSettingsView />
}
