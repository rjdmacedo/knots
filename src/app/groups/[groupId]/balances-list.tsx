'use client'

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Balances, Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, LayoutList } from 'lucide-react'
import { useLocale } from 'next-intl'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'

type Props = {
  balances: Balances
  participants: { id: string; name: string }[]
  currency: Currency
  reimbursements: Reimbursement[]
}

export function BalancesList({
  balances,
  participants,
  currency,
  reimbursements,
}: Props) {
  const locale = useLocale()

  const getParticipant = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? '?'

  // Build a map of participantId -> tooltip description
  const tooltipMap: Record<string, string> = {}
  for (const participant of participants) {
    const balance = balances[participant.id]?.total ?? 0
    if (balance < 0) {
      // This person owes money — find who they owe
      const owes = reimbursements
        .filter((r) => r.from === participant.id)
        .map(
          (r) =>
            `${formatCurrency(currency, r.amount, locale)} → ${getParticipant(
              r.to,
            )}`,
        )
      tooltipMap[participant.name] = owes.length
        ? `${participant.name} owes ${owes.join(', ')}`
        : `${participant.name}: ${formatCurrency(currency, balance, locale)}`
    } else if (balance > 0) {
      // This person is owed money — find who owes them
      const owedBy = reimbursements
        .filter((r) => r.to === participant.id)
        .map(
          (r) =>
            `${formatCurrency(currency, r.amount, locale)} ← ${getParticipant(
              r.from,
            )}`,
        )
      tooltipMap[participant.name] = owedBy.length
        ? `${participant.name} is owed ${owedBy.join(', ')}`
        : `${participant.name}: ${formatCurrency(currency, balance, locale)}`
    } else {
      tooltipMap[participant.name] = `${participant.name}: settled up`
    }
  }

  const chartData = participants.map((participant) => {
    const balance = balances[participant.id]?.total ?? 0
    return {
      name: participant.name,
      balance,
      formattedBalance: formatCurrency(currency, balance, locale),
      tooltip: tooltipMap[participant.name] ?? '',
    }
  })

  const chartConfig = {
    balance: {
      label: 'Balance',
    },
  } satisfies ChartConfig

  const CustomTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0].payload
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
        {data.tooltip}
      </div>
    )
  }

  return (
    <Tabs defaultValue="horizontal" className="w-full">
      <div className="flex justify-end mb-2">
        <TabsList className="h-8">
          <TabsTrigger value="horizontal" className="px-2">
            <LayoutList className="size-4" />
          </TabsTrigger>
          <TabsTrigger value="vertical" className="px-2">
            <BarChart3 className="size-4" />
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="horizontal">
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: `${Math.max(chartData.length * 44, 100)}px` }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 60 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={80}
            />
            <XAxis type="number" hide />
            <ChartTooltip cursor={false} content={<CustomTooltipContent />} />
            <Bar dataKey="balance" radius={4}>
              <LabelList
                dataKey="formattedBalance"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
              />
              {chartData.map((item) => (
                <Cell
                  key={item.name}
                  fill={
                    item.balance >= 0
                      ? 'var(--color-credit)'
                      : 'var(--color-debt)'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </TabsContent>

      <TabsContent value="vertical">
        <ChartContainer config={chartConfig} className="w-full min-h-[200px]">
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 20, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                value.length > 8 ? value.slice(0, 8) + '…' : value
              }
            />
            <YAxis hide />
            <ChartTooltip cursor={false} content={<CustomTooltipContent />} />
            <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="formattedBalance"
                position="top"
                offset={8}
                className="fill-foreground"
                fontSize={11}
              />
              {chartData.map((item) => (
                <Cell
                  key={item.name}
                  fill={
                    item.balance >= 0
                      ? 'var(--color-credit)'
                      : 'var(--color-debt)'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </TabsContent>
    </Tabs>
  )
}
