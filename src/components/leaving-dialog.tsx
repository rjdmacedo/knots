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
  cancelLabel?: string
  confirmLabel?: string
}

export const LeavingDialog = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
  cancelLabel = 'No',
  confirmLabel = 'Yes',
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
          <AlertDialogCancel onClick={() => onCancel()}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm()}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
