import { PropsWithChildren } from 'react'

export function AppPageContainer({ children }: PropsWithChildren) {
  return (
    <div className="flex-1 max-w-[var(--breakpoint-md)] w-full mx-auto px-4 flex flex-col gap-6">
      {children}
    </div>
  )
}
