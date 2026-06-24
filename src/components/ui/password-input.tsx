'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        className={cn('pe-9', className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute inset-y-0 right-1 my-auto text-muted-foreground active:translate-y-0"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        disabled={props.disabled}
      >
        <span className="relative size-4" aria-hidden>
          <Eye
            className={cn(
              'absolute inset-0 size-4 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              showPassword ? 'opacity-0' : 'opacity-100',
            )}
          />
          <EyeOff
            className={cn(
              'absolute inset-0 size-4 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              showPassword ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      </Button>
    </div>
  )
}
