import {
  RecentGroup,
  archiveGroup,
  deleteRecentGroup,
  starGroup,
  unarchiveGroup,
  unstarGroup,
} from '@/app/groups/recent-groups-helpers'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { isPushSupported, registerServiceWorker } from '@/lib/push/register-sw'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { StarFilledIcon } from '@radix-ui/react-icons'
import {
  Bell,
  BellOff,
  Calendar,
  MoreHorizontal,
  Star,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export function RecentGroupListCard({
  group,
  groupDetail,
  isStarred,
  isArchived,
  refreshGroupsFromStorage,
}: {
  group: RecentGroup
  groupDetail?: AppRouterOutput['groups']['list']['groups'][number]
  isStarred: boolean
  isArchived: boolean
  refreshGroupsFromStorage: () => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Groups')

  const [pushSupported, setPushSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isNotifLoading, setIsNotifLoading] = useState(false)
  const checkedRef = useRef(false)

  const createMutation = trpc.pushSubscriptions.create.useMutation()
  const deleteMutation = trpc.pushSubscriptions.delete.useMutation()

  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true

    if (typeof window === 'undefined') return
    const supported = isPushSupported()
    setPushSupported(supported)

    if (supported) {
      registerServiceWorker()
        .then((registration) => registration?.pushManager.getSubscription())
        .then(async (subscription) => {
          if (!subscription) return

          const res = await fetch(
            `/api/trpc/pushSubscriptions.list?batch=1&input=${encodeURIComponent(
              JSON.stringify({
                '0': { json: { endpoint: subscription.endpoint } },
              }),
            )}`,
          )
          if (!res.ok) return

          const json = (await res.json()) as Array<{
            result?: {
              data?: {
                json?: Array<{
                  groupId: string
                  participantName: string | null
                }>
              }
            }
          }>
          const subscriptions = json?.[0]?.result?.data?.json
          if (Array.isArray(subscriptions)) {
            const groupSub = subscriptions.find(
              (s: { groupId: string }) => s.groupId === group.id,
            )
            if (groupSub) {
              setIsSubscribed(true)
            }
          }
        })
        .catch(() => {
          // Silently handle errors during status check
        })
    }
  }, [group.id])

  const toggleNotifications = useCallback(async () => {
    setIsNotifLoading(true)
    try {
      if (isSubscribed) {
        const registration = await registerServiceWorker()
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          await deleteMutation.mutateAsync({
            endpoint: subscription.endpoint,
            groupId: group.id,
          })
          await subscription.unsubscribe()
        }
        setIsSubscribed(false)
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setIsNotifLoading(false)
          return
        }

        const registration = await registerServiceWorker()
        if (!registration) {
          setIsNotifLoading(false)
          return
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        const json = subscription.toJSON()
        await createMutation.mutateAsync({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
          groupId: group.id,
        })
        setIsSubscribed(true)
      }
    } catch {
      // Silently handle errors
    } finally {
      setIsNotifLoading(false)
    }
  }, [isSubscribed, group.id, createMutation, deleteMutation])

  return (
    <li key={group.id}>
      <Button
        variant="secondary"
        className="h-fit w-full py-3 rounded-lg border bg-card shadow-xs"
        asChild
      >
        <div
          className="text-base"
          onClick={() => router.push(`/groups/${group.id}`)}
        >
          <div className="w-full flex flex-col gap-1">
            <div className="text-base flex gap-2 justify-between">
              <Link
                href={`/groups/${group.id}`}
                className="flex-1 overflow-hidden text-ellipsis"
              >
                {group.name}
              </Link>
              <span className="shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="-my-3 -ml-3 -mr-1.5"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isStarred) {
                      unstarGroup(group.id)
                    } else {
                      starGroup(group.id)
                      unarchiveGroup(group.id)
                    }
                    refreshGroupsFromStorage()
                  }}
                >
                  {isStarred ? (
                    <StarFilledIcon className="w-4 h-4 text-orange-400" />
                  ) : (
                    <Star className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="-my-3 -mr-3 -ml-1.5"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {pushSupported && (
                      <DropdownMenuItem
                        disabled={isNotifLoading}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleNotifications()
                        }}
                      >
                        {isSubscribed ? (
                          <BellOff className="w-4 h-4 mr-2" />
                        ) : (
                          <Bell className="w-4 h-4 mr-2" />
                        )}
                        {isSubscribed
                          ? t('disableNotifications')
                          : t('enableNotifications')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteRecentGroup(group)
                        refreshGroupsFromStorage()

                        toast.success(t('RecentRemovedToast.title'), {
                          description: t('RecentRemovedToast.description'),
                        })
                      }}
                    >
                      {t('removeRecent')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isArchived) {
                          unarchiveGroup(group.id)
                        } else {
                          archiveGroup(group.id)
                          unstarGroup(group.id)
                        }
                        refreshGroupsFromStorage()
                      }}
                    >
                      {t(isArchived ? 'unarchive' : 'archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
            <div className="text-muted-foreground font-normal text-xs">
              {groupDetail ? (
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center">
                    <Users className="w-3 h-3 inline mr-1" />
                    <span>{groupDetail._count.participants}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-3 h-3 inline mx-1" />
                    <span>
                      {new Date(groupDetail.createdAt).toLocaleDateString(
                        locale,
                        {
                          dateStyle: 'medium',
                        },
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Button>
    </li>
  )
}
