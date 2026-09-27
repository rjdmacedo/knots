'use client'

import { getInitials } from '@/components/expense-detail/participant-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Loader2, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  SettingsFieldRow,
  SettingsList,
  SettingsRow,
  SettingsSection,
  settingsControlId,
} from './settings-ui'

/**
 * Profile section, task 5.2: photo + display name.
 *
 * The photo row and the name field live inside a single
 * `<form id="account-profile-form" className="contents">` (design decision 2),
 * so the rows stay in the divided list while the section footer's Save changes
 * button submits the form through the `form` attribute (design decision 3).
 *
 * Photo is immediate: choose resizes to a JPEG (max edge 512, quality ~0.86),
 * presigns, PUTs, then `profile.setImage`. Name is explicit and only writes on
 * Save changes.
 *
 * Only the photo row and name field belong to the form. Email, password, and
 * passkey rows (`credentialRows`) render as siblings in the same list, outside
 * the form (req 4.5), so their buttons cannot submit a name change. Task 5.3
 * replaces those placeholders with the real credential rows and dialogs.
 */

const NAME_MAX_LENGTH = 50
const NAME_MIN_LENGTH = 2
/** Longest edge of the resized JPEG, per design decision 3. */
const MAX_IMAGE_EDGE = 512
/** JPEG quality for the resized upload, per design decision 3. */
const IMAGE_QUALITY = 0.86

/**
 * Recognize the profile-image "storage unavailable" error. The service tags it
 * with `IMAGE_STORAGE_UNAVAILABLE` in the error `cause` so the client can keep
 * the buttons visible and toast an unavailable message rather than a generic
 * failure, without writing an image (req 3.5).
 */
function isStorageUnavailable(error: unknown): boolean {
  const cause = (error as { data?: { cause?: unknown } } | null)?.data?.cause
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return (cause as { code?: string }).code === 'IMAGE_STORAGE_UNAVAILABLE'
  }
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : ''
  return message.includes('IMAGE_STORAGE_UNAVAILABLE')
}

/**
 * Draw `file` onto a canvas scaled so its longest edge is at most
 * `MAX_IMAGE_EDGE`, then export a JPEG blob. Runs entirely in the browser so
 * the upload is a predictable size and type regardless of the source image.
 */
async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas is not available')
    }
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', IMAGE_QUALITY)
    })
    if (!blob) {
      throw new Error('Could not encode the image')
    }
    return blob
  } finally {
    bitmap.close()
  }
}

export function ProfileSection({
  name: savedName,
  image,
  credentialRows,
}: {
  name: string
  image: string | null
  /** Email, password, and passkey rows, rendered outside the form (req 4.5). */
  credentialRows?: React.ReactNode
}) {
  const t = useTranslations('ProfileSettings')
  const tp = useTranslations('ProfileSettings.Profile')
  const router = useRouter()
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(savedName)
  const [savedNameState, setSavedNameState] = useState(savedName)
  const [currentImage, setCurrentImage] = useState<string | null>(image)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const presignImage = trpc.profile.presignImage.useMutation()
  const setImage = trpc.profile.setImage.useMutation()
  const removeImage = trpc.profile.removeImage.useMutation()
  const changeName = trpc.profile.changeName.useMutation()

  const nameId = 'account-settings-name'
  const nameControlId = settingsControlId(nameId)

  const trimmedName = name.trim()
  const nameIsDirty = trimmedName !== savedNameState
  const savePending = changeName.isPending
  const saveDisabled = !nameIsDirty || savePending

  /**
   * Refresh the name and image shown by the user menu. The menu renders from
   * the server session, so a router refresh re-renders it, and the profile
   * query is invalidated for any client reader (req 3.3, 4.4).
   */
  function refreshProfileConsumers() {
    utils.profile.getProfile.invalidate()
    utils.groupMembership.getUserGroups.invalidate()
    utils.friends.list.invalidate()
    router.refresh()
  }

  function handleChoosePhoto() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    // Reset so choosing the same file again still triggers change.
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error(tp('photoInvalidToast'))
      return
    }

    setPhotoBusy(true)
    try {
      const blob = await resizeToJpeg(file)
      const presigned = await presignImage.mutateAsync({
        contentType: 'image/jpeg',
      })
      if (!presigned) {
        throw new Error('Presign returned no upload URL')
      }

      const putResponse = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': presigned.contentType },
      })
      if (!putResponse.ok) {
        throw new Error(`Upload failed with status ${putResponse.status}`)
      }

      const result = await setImage.mutateAsync({
        key: presigned.key,
        signature: presigned.signature,
      })

      setCurrentImage(result.image ?? presigned.publicUrl)
      refreshProfileConsumers()
      toast.success(tp('photoUpdatedToast'))
    } catch (error) {
      if (isStorageUnavailable(error)) {
        toast.error(tp('photoUnavailableToast'))
      } else {
        toast.error(tp('photoFailedToast'))
      }
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true)
    try {
      await removeImage.mutateAsync()
      setCurrentImage(null)
      refreshProfileConsumers()
      toast.success(tp('photoRemovedToast'))
    } catch (error) {
      if (isStorageUnavailable(error)) {
        toast.error(tp('photoUnavailableToast'))
      } else {
        toast.error(tp('photoFailedToast'))
      }
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Client length checks: empty, <2, or >50 shows the alert and does not
    // call changeName (req 4.3).
    if (
      trimmedName.length < NAME_MIN_LENGTH ||
      trimmedName.length > NAME_MAX_LENGTH
    ) {
      setNameError(tp('nameError'))
      return
    }
    setNameError(null)

    try {
      await changeName.mutateAsync({ name: trimmedName })
      setSavedNameState(trimmedName)
      setName(trimmedName)
      refreshProfileConsumers()
      toast.success(tp('nameUpdatedToast'))
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : tp('photoFailedToast')
      setNameError(message)
    }
  }

  const initials = getInitials(name || savedNameState)

  return (
    <SettingsSection
      icon={UserRound}
      title={t('profileTitle')}
      footer={
        <>
          {nameError ? (
            <div role="alert" className="w-full text-sm text-destructive">
              {nameError}
            </div>
          ) : null}
          <Button
            type="submit"
            form="account-profile-form"
            disabled={saveDisabled}
          >
            {savePending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {savePending ? tp('saving') : tp('saveChanges')}
          </Button>
        </>
      }
    >
      <SettingsList>
        {/* Photo and name live in one form using `contents` so the rows keep
            their place in the divided list (design decision 2). */}
        <form
          id="account-profile-form"
          className="contents"
          onSubmit={handleSubmit}
        >
          <SettingsRow
            id="profile-photo"
            label={tp('photoLabel')}
            description={tp('photoDescription')}
            control={
              <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                <span
                  className={cn(
                    'flex size-50 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-7xl font-medium text-primary',
                  )}
                >
                  {currentImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentImage}
                      alt={tp('photoAlt')}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span aria-hidden>{initials}</span>
                  )}
                </span>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleChoosePhoto}
                    disabled={photoBusy}
                  >
                    {photoBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {tp('choosePhoto')}
                  </Button>
                  {currentImage ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleRemovePhoto}
                      disabled={photoBusy}
                    >
                      {tp('removePhoto')}
                    </Button>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>
              </div>
            }
          />

          <SettingsFieldRow
            id={nameId}
            label={tp('nameLabel')}
            control={
              <Input
                id={nameControlId}
                name="name"
                className="text-base"
                autoComplete="name"
                maxLength={NAME_MAX_LENGTH}
                placeholder={tp('namePlaceholder')}
                value={name}
                aria-invalid={nameError ? true : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (nameError) setNameError(null)
                }}
              />
            }
          />
        </form>

        {/* Credentials sit outside the form so their buttons cannot submit the
            name change (req 4.5). Task 5.3 replaces these placeholders. */}
        {credentialRows}
      </SettingsList>
    </SettingsSection>
  )
}
