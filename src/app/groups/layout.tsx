import { PropsWithChildren, Suspense } from 'react'

export default function GroupsLayout({ children }: PropsWithChildren<{}>) {
  return (
    <Suspense>
      <div className="flex-1 max-w-[var(--breakpoint-md)] w-full mx-auto px-4 flex flex-col gap-6">
        {children}
      </div>
    </Suspense>
  )
}
