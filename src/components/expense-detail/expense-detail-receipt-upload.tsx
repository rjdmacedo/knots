'use client'

import { DocumentThumbnail } from '@/components/expense-documents-input'
import { randomId } from '@/lib/api'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { cn, formatFileSize } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Camera, Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import { useState } from 'react'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 5 * 1024 ** 2

type Document = {
  id: string
  url: string
  width: number
  height: number
}

type GroupProps = {
  variant: 'group'
  groupId: string
  expenseId: string
  documents: Document[]
}

type DirectProps = {
  variant: 'direct'
  expenseId: string
  documents: Document[]
}

type Props = GroupProps | DirectProps

export function ExpenseDetailReceiptUpload(props: Props) {
  const { documents, expenseId, variant } = props
  const groupId = variant === 'group' ? props.groupId : undefined
  const t = useTranslations('ExpenseDetail')
  const tDocs = useTranslations('ExpenseDocumentsInput')
  const locale = useLocale()
  const utils = trpc.useUtils()
  const [uploading, setUploading] = useState(false)
  const { FileInput, openFileDialog, uploadToS3 } = usePresignedUpload()

  const invalidateQueries = () => {
    if (variant === 'group' && groupId) {
      utils.groups.expenses.get.invalidate({ groupId, expenseId })
      utils.groups.expenses.list.invalidate()
      invalidateActivityQueries(utils)
      return
    }

    utils.friends.getDirectExpense.invalidate({ expenseId })
    utils.friends.getTimeline.invalidate()
  }

  const { mutateAsync: addGroupDocuments } =
    trpc.groups.expenses.addDocuments.useMutation({
      onSuccess: invalidateQueries,
    })

  const { mutateAsync: addDirectDocuments } =
    trpc.friends.addDirectExpenseDocuments.useMutation({
      onSuccess: invalidateQueries,
    })

  const handleFileChange = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(tDocs('TooBigToast.title'), {
        description: tDocs('TooBigToast.description', {
          maxSize: formatFileSize(MAX_FILE_SIZE, locale),
          size: formatFileSize(file.size, locale),
        }),
      })
      return
    }

    setUploading(true)

    try {
      const { width, height } = await getImageData(file)
      if (!width || !height) {
        throw new Error('Cannot get image dimensions')
      }

      const { url } = await uploadToS3(file)
      const document = {
        id: randomId(),
        url,
        width,
        height,
      }

      if (variant === 'group' && groupId) {
        await addGroupDocuments({
          groupId,
          expenseId,
          documents: [document],
        })
      } else {
        await addDirectDocuments({
          expenseId,
          documents: [document],
        })
      }

      toast.success(t('receiptUploadSuccess'))
    } catch (error) {
      console.error(error)
      toast.error(tDocs('ErrorToast.title'), {
        description: tDocs('ErrorToast.description'),
      })
    } finally {
      setUploading(false)
    }
  }

  const firstDocument = documents[0]

  if (firstDocument) {
    return (
      <div className="size-20 shrink-0">
        <DocumentThumbnail
          document={firstDocument}
          documents={documents}
          deleteDocument={() => undefined}
          readOnly
        />
      </div>
    )
  }

  return (
    <div className="size-20 shrink-0">
      <FileInput onChange={handleFileChange} accept="image/jpeg,image/png" />
      <button
        type="button"
        aria-label={t('attachReceipt')}
        disabled={uploading}
        onClick={openFileDialog}
        className={cn(
          'flex size-full items-center justify-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground transition-colors',
          'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          uploading && 'opacity-70',
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <Camera className="size-6" />
        )}
      </button>
    </div>
  )
}
