import { PropsWithChildren } from 'react'

export default function SettingsLayout({ children }: PropsWithChildren<{}>) {
  return (
    <div className="flex-1 max-w-[var(--breakpoint-md)] w-full mx-auto px-4 flex flex-col gap-6 py-6">
      {children}
    </div>
  )
}
