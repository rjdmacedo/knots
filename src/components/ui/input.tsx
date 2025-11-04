import * as React from "react"
import { defaultTo, omitBy, isUndefined, omit } from 'lodash-es'

import { cn } from "@/lib/utils"

function Input({ className, type = 'text', value, defaultValue, ...props }: React.ComponentProps<"input">) {
  // For text-like inputs, ensure value is always a string to prevent uncontrolled/controlled switching
  // When React Hook Form passes value={undefined}, normalize to '' to keep it controlled
  // File inputs should remain uncontrolled, checkbox/radio use 'checked' prop instead
  const isTextInput = type !== 'file' && type !== 'checkbox' && type !== 'radio'
  
  // If defaultValue is provided but value is not, treat as uncontrolled (don't set value prop)
  // Otherwise, treat as controlled and normalize undefined to empty string
  const isUncontrolled = defaultValue !== undefined && value === undefined
  
  // Normalize undefined to empty string for controlled text inputs to keep them controlled
  // Don't normalize if uncontrolled (when defaultValue is provided but value is not)
  const normalizedValue = isTextInput && !isUncontrolled ? defaultTo(value, '') : value
  
  // Only include value prop if it's defined and we're not in uncontrolled mode
  // For file inputs, don't set value at all
  const valueProp = !isUncontrolled && normalizedValue !== undefined 
    ? omitBy({ value: normalizedValue }, isUndefined)
    : {}
  
  // If we're setting a value prop, remove defaultValue to avoid having both (controlled vs uncontrolled)
  const cleanedProps = valueProp.value !== undefined ? omit(props, ['defaultValue']) : props
  
  return (
    <input
      type={type}
      data-slot="input"
      {...valueProp}
      {...cleanedProps}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
    />
  )
}

export { Input }
