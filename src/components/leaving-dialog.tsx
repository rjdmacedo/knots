import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type LeavingDialogProps = {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
  // --- optional
  title?: string
  description?: string
}

export const LeavingDialog = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
}: LeavingDialogProps) => {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title || 'Leave page?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ||
              'Are you sure you want to leave this page? Unsaved changes will be lost.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onCancel()}>No</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm()}>Yes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
