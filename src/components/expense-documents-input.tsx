import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { randomId } from '@/lib/api'
import { api } from '@/lib/api-client'
import { ExpenseFormValues } from '@/lib/schemas'
import { formatFileSize } from '@/lib/utils'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Loader2, Plus, Trash, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type PendingDocument = {
  id: string
  file: File
  previewUrl: string
  width: number
  height: number
}

type Props = {
  documents: ExpenseFormValues['documents']
  updateDocuments: (documents: ExpenseFormValues['documents']) => void
  onUploadPending?: (uploadPending: () => Promise<void>) => void
  onDeletePending?: (deletePending: () => Promise<void>) => void
}

const MAX_FILE_SIZE = 5 * 1024 ** 2

export function ExpenseDocumentsInput({
  documents,
  updateDocuments,
  onUploadPending,
  onDeletePending,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('ExpenseDocumentsInput')
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingDocument[]>([])
  const [documentsToDelete, setDocumentsToDelete] = useState<string[]>([]) // URLs of documents to delete from S3
  const { FileInput, openFileDialog, uploadToS3 } = usePresignedUpload() // use presigned uploads to additionally support providers other than AWS

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach((pending) => {
        URL.revokeObjectURL(pending.previewUrl)
      })
    }
  }, [pendingFiles])

  const uploadPendingFiles = useCallback(async () => {
    if (pendingFiles.length === 0) return

    setUploading(true)
    const uploaded: ExpenseFormValues['documents'] = []
    const errors: PendingDocument[] = []

    for (const pending of pendingFiles) {
      try {
        const { url } = await uploadToS3(pending.file)
        uploaded.push({
          id: pending.id,
          url,
          width: pending.width,
          height: pending.height,
        })
        // Cleanup preview URL
        URL.revokeObjectURL(pending.previewUrl)
      } catch (err) {
        console.error(err)
        errors.push(pending)
      }
    }

    if (errors.length > 0) {
      toast.error(t('ErrorToast.title'), {
        description: t('ErrorToast.description'),
      })
      // Keep failed uploads in pending
      setPendingFiles(errors)
    } else {
      // All uploaded successfully
      setPendingFiles([])
    }

    if (uploaded.length > 0) {
      updateDocuments([...documents, ...uploaded])
    }

    setUploading(false)

    if (errors.length > 0) {
      throw new Error('Some files failed to upload')
    }
  }, [pendingFiles, uploadToS3, t, updateDocuments, documents])

  const deletePendingDocuments = useCallback(async () => {
    if (documentsToDelete.length === 0) return

    const errors: string[] = []

    for (const url of documentsToDelete) {
      try {
        await api.delete('/api/s3-object', {
          query: { url },
        })
      } catch (err) {
        console.error(err)
        errors.push(url)
      }
    }

    if (errors.length > 0) {
      toast.error(t('ErrorToast.title'), {
        description: t('ErrorToast.description'),
      })
      // Keep failed deletions
      setDocumentsToDelete(errors)
    } else {
      // All deleted successfully
      setDocumentsToDelete([])
    }

    if (errors.length > 0) {
      throw new Error('Some documents failed to delete')
    }
  }, [documentsToDelete, t])

  // Expose upload and delete functions to parent
  useEffect(() => {
    if (onUploadPending) {
      onUploadPending(uploadPendingFiles)
    }
  }, [uploadPendingFiles, onUploadPending])

  useEffect(() => {
    if (onDeletePending) {
      onDeletePending(deletePendingDocuments)
    }
  }, [deletePendingDocuments, onDeletePending])

  const handleFileChange = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t('TooBigToast.title'), {
        description: t('TooBigToast.description', {
          maxSize: formatFileSize(MAX_FILE_SIZE, locale),
          size: formatFileSize(file.size, locale),
        }),
      })
      return
    }

    try {
      const { width, height } = await getImageData(file)
      if (!width || !height) throw new Error('Cannot get image dimensions')

      const previewUrl = URL.createObjectURL(file)
      const pendingDoc: PendingDocument = {
        id: randomId(),
        file,
        previewUrl,
        width,
        height,
      }

      setPendingFiles([...pendingFiles, pendingDoc])
    } catch (err) {
      console.error(err)
      toast.error(t('ErrorToast.title'), {
        description: t('ErrorToast.description'),
      })
    }
  }

  const deletePendingDocument = (id: string) => {
    const pending = pendingFiles.find((p) => p.id === id)
    if (pending) {
      URL.revokeObjectURL(pending.previewUrl)
      setPendingFiles(pendingFiles.filter((p) => p.id !== id))
    }
  }

  const allDocuments = [
    ...documents.map((doc) => ({ ...doc, isPending: false })),
    ...pendingFiles.map((pending) => ({
      id: pending.id,
      url: pending.previewUrl,
      width: pending.width,
      height: pending.height,
      isPending: true,
    })),
  ]

  return (
    <div>
      <FileInput onChange={handleFileChange} accept="image/jpeg,image/png" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 [&_*]:aspect-square">
        {allDocuments.map((doc) => (
          <DocumentThumbnail
            key={doc.id}
            document={doc}
            documents={allDocuments}
            deleteDocument={async (document) => {
              if (document.isPending) {
                deletePendingDocument(document.id)
              } else {
                // Mark for deletion instead of deleting immediately
                setDocumentsToDelete([...documentsToDelete, document.url])
                updateDocuments(documents.filter((d) => d.id !== document.id))
              }
            }}
          />
        ))}

        <div>
          <Button
            variant="secondary"
            type="button"
            onClick={openFileDialog}
            className="w-full h-full"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Plus className="w-8 h-8" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

type DocumentWithPending = ExpenseFormValues['documents'][number] & {
  isPending?: boolean
}

export function DocumentThumbnail({
  document,
  documents,
  deleteDocument,
}: {
  document: DocumentWithPending
  documents: DocumentWithPending[]
  deleteDocument: (document: DocumentWithPending) => void
}) {
  const [open, setOpen] = useState(false)
  const [api, setApi] = useState<CarouselApi>()
  const [currentDocument, setCurrentDocument] = useState<number | null>(null)

  useEffect(() => {
    if (!api) return

    api.on('slidesInView', () => {
      const index = api.slidesInView()[0]
      if (index !== undefined) {
        setCurrentDocument(index)
      }
    })
  }, [api])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className="w-full h-full border overflow-hidden rounded shadow-inner"
        >
          <Image
            width={300}
            height={300}
            className="object-contain"
            src={document.url}
            alt=""
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-4 w-screen max-w-[100vw] h-dvh max-h-dvh sm:max-w-[calc(100vw-32px)] sm:max-h-[calc(100dvh-32px)] [&>*:last-child]:hidden">
        <VisuallyHidden.Root>
          <DialogTitle>Document viewer</DialogTitle>
        </VisuallyHidden.Root>
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (currentDocument !== null) {
                  deleteDocument(documents[currentDocument])
                }
                setOpen(false)
              }}
            >
              <Trash className="w-4 h-4 mr-2" />
              Delete document
            </Button>
            <DialogClose asChild>
              <Button variant="ghost">
                <X className="w-4 h-4 mr-2" /> Close
              </Button>
            </DialogClose>
          </div>

          <Carousel
            opts={{
              startIndex: documents.indexOf(document),
              loop: true,
              align: 'center',
            }}
            setApi={setApi}
          >
            <CarouselContent>
              {documents.map((document, index) => (
                <CarouselItem key={index}>
                  <Image
                    className="object-contain w-[calc(100vw-32px)] h-[calc(100dvh-32px-40px-16px-48px)] sm:w-[calc(100vw-32px-32px)] sm:h-[calc(100dvh-32px-40px-16px-32px-48px)]"
                    src={document.url}
                    width={document.width}
                    height={document.height}
                    alt=""
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-0 top-auto -bottom-16" />
            <CarouselNext className="right-0 top-auto -bottom-16" />
          </Carousel>
        </div>
      </DialogContent>
    </Dialog>
  )
}
