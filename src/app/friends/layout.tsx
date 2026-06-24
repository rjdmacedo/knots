import { AppPageContainer } from '@/components/app-page-container'
import { PropsWithChildren } from 'react'

export default function FriendsLayout({ children }: PropsWithChildren) {
  return <AppPageContainer>{children}</AppPageContainer>
}
