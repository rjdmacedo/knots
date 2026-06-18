import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AsyncButton } from './async-button'
import { Button } from './ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'

export function DeletePopup({ onDelete }: { onDelete: () => Promise<void> }) {
  const t = useTranslations('ExpenseForm.DeletePopup')
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2 className="w-4 h-4 mr-2" />
        {t('label')}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
        <DialogFooter className="flex flex-col gap-2">
          <AsyncButton
            type="button"
            variant="destructive"
            loadingContent="Deleting…"
            action={onDelete}
          >
            {t('yes')}
          </AsyncButton>
          <DialogClose render={<Button variant="secondary" />}>
            {t('cancel')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
