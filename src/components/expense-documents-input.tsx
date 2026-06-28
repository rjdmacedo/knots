import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Locale } from '@/i18n'
import { randomId } from '@/lib/api'
import { api } from '@/lib/api-client'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn, formatFileSize } from '@/lib/utils'
import { Plus, Trash, XIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { getImageData, usePresignedUpload } from 'next-s3-upload'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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

function getFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop()
    return name ? decodeURIComponent(name) : 'receipt.jpg'
  } catch {
    return 'receipt.jpg'
  }
}

function getFileExtension(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase()
  return ext && ext.length <= 5 ? ext : 'JPG'
}

function getDocumentMeta(
  fileName: string,
  locale: Locale,
  fileSize?: number,
): string {
  const ext = getFileExtension(fileName)
  if (fileSize != null) {
    return `${ext} · ${formatFileSize(fileSize, locale)}`
  }
  return ext
}

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
  const [documentsToDelete, setDocumentsToDelete] = useState<string[]>([])
  const { FileInput, openFileDialog, uploadToS3 } = usePresignedUpload()

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
      setPendingFiles(errors)
    } else {
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
      setDocumentsToDelete(errors)
    } else {
      setDocumentsToDelete([])
    }

    if (errors.length > 0) {
      throw new Error('Some documents failed to delete')
    }
  }, [documentsToDelete, t])

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

  const allDocuments: ExpenseDocumentItem[] = [
    ...documents.map((doc) => ({
      ...doc,
      isPending: false,
      fileName: getFileNameFromUrl(doc.url),
    })),
    ...pendingFiles.map((pending) => ({
      id: pending.id,
      url: pending.previewUrl,
      width: pending.width,
      height: pending.height,
      isPending: true,
      fileName: pending.file.name,
      fileSize: pending.file.size,
    })),
  ]

  return (
    <div>
      <FileInput onChange={handleFileChange} accept="image/jpeg,image/png" />

      <AttachmentGroup className="w-full">
        {allDocuments.map((doc) => (
          <DocumentThumbnail
            key={doc.id}
            document={doc}
            documents={allDocuments}
            locale={locale as Locale}
            uploading={uploading}
            deleteDocument={(document) => {
              if (document.isPending) {
                deletePendingDocument(document.id)
              } else {
                setDocumentsToDelete([...documentsToDelete, document.url])
                updateDocuments(documents.filter((d) => d.id !== document.id))
              }
            }}
          />
        ))}

        <Attachment
          state="idle"
          orientation="vertical"
          className={cn(
            'shrink-0',
            uploading && 'pointer-events-none opacity-50',
          )}
        >
          <AttachmentMedia className="mx-auto w-10 shrink-0 [&_svg]:size-6">
            <Plus className="text-muted-foreground" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{t('addImage')}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentTrigger
            type="button"
            onClick={openFileDialog}
            disabled={uploading}
            aria-label={t('addImage')}
            className="focus-visible:ring-inset"
          />
        </Attachment>
      </AttachmentGroup>
    </div>
  )
}

type ExpenseDocumentItem = ExpenseFormValues['documents'][number] & {
  isPending?: boolean
  fileName?: string
  fileSize?: number
}

export function DocumentThumbnail({
  document,
  documents,
  deleteDocument,
  readOnly = false,
  uploading = false,
  locale,
}: {
  document: ExpenseDocumentItem
  documents: ExpenseDocumentItem[]
  deleteDocument: (document: ExpenseDocumentItem) => void
  readOnly?: boolean
  uploading?: boolean
  locale?: Locale
}) {
  const t = useTranslations('ExpenseDocumentsInput')
  const defaultLocale = useLocale() as Locale
  const resolvedLocale = locale ?? defaultLocale
  const [open, setOpen] = useState(false)
  const [api, setApi] = useState<CarouselApi>()
  const [currentDocument, setCurrentDocument] = useState<number | null>(null)

  const fileName = document.fileName ?? getFileNameFromUrl(document.url)
  const meta = getDocumentMeta(fileName, resolvedLocale, document.fileSize)
  const attachmentState = document.isPending && uploading ? 'uploading' : 'done'

  useEffect(() => {
    if (!api) return

    api.on('slidesInView', () => {
      const index = api.slidesInView()[0]
      if (index !== undefined) {
        setCurrentDocument(index)
      }
    })
  }, [api])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }

    globalThis.document.addEventListener('keydown', onKeyDown, true)
    return () =>
      globalThis.document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  return (
    <>
      <Attachment
        state={attachmentState}
        orientation="vertical"
        className="shrink-0"
      >
        <AttachmentMedia variant="image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={document.url} alt="" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{fileName}</AttachmentTitle>
          <AttachmentDescription>
            {attachmentState === 'uploading' ? t('uploadingDocument') : meta}
          </AttachmentDescription>
        </AttachmentContent>
        {!readOnly ? (
          <AttachmentActions>
            <AttachmentAction
              aria-label={t('removeDocument', { name: fileName })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                deleteDocument(document)
              }}
            >
              <XIcon />
            </AttachmentAction>
          </AttachmentActions>
        ) : null}
        <AttachmentTrigger
          type="button"
          aria-label={t('previewDocument', { name: fileName })}
          className="focus-visible:ring-inset"
          onClick={() => setOpen(true)}
        />
      </Attachment>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('previewDocument', { name: fileName })}
            className="fixed inset-0 z-[100] flex flex-col gap-4 bg-popover p-4 text-popover-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end">
              {!readOnly ? (
                <Button
                  type="button"
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
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                <XIcon className="w-4 h-4 mr-2" /> Close
              </Button>
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
          </div>,
          globalThis.document.body,
        )}
    </>
  )
}
