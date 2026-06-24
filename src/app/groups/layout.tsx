import { AppPageContainer } from '@/components/app-page-container'
import { PropsWithChildren, Suspense } from 'react'

export default function GroupsLayout({ children }: PropsWithChildren) {
  return (
    <Suspense>
      <AppPageContainer>{children}</AppPageContainer>
    </Suspense>
  )
}
