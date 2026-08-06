import { Button, ButtonProps } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { ReactNode } from 'react'
import { useFormState } from 'react-hook-form'

type Props = {
  loadingContent: ReactNode
  isLoading?: boolean
} & ButtonProps

export function SubmitButton({
  children,
  loadingContent,
  isLoading,
  ...props
}: Props) {
  const { isSubmitting } = useFormState()
  const showLoading = isSubmitting || isLoading
  return (
    <Button type="submit" disabled={showLoading} {...props}>
      {showLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {loadingContent}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
