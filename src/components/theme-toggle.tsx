'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Monitor, Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // next-themes resolves theme only on the client; keep SSR and first paint in sync.
  const value = mounted ? (theme ?? 'system') : 'system'

  return (
    <Select
      items={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ]}
      value={value}
      onValueChange={(val) => val && setTheme(val)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">
          <div className="flex items-center gap-2">
            <Sun className="size-4" />
            <span>Light</span>
          </div>
        </SelectItem>
        <SelectItem value="dark">
          <div className="flex items-center gap-2">
            <Moon className="size-4" />
            <span>Dark</span>
          </div>
        </SelectItem>
        <SelectItem value="system">
          <div className="flex items-center gap-2">
            <Monitor className="size-4" />
            <span>System</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
