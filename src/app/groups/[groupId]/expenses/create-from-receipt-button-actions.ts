'use server'
import { getAIClient, getAIModel } from '@/lib/ai-client'
import { getCategories } from '@/lib/api'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.mjs'

export type ReceiptExtractedItem = { title: string; amount: number }

/**
 * Best-effort parse of an optional trailing JSON line of line items. Any failure
 * (missing line, invalid JSON, wrong shape) yields an empty list — item prefill
 * is strictly optional and never required (Requirement 9.4).
 */
function parseReceiptItems(
  itemsLine: string | undefined,
): ReceiptExtractedItem[] {
  if (!itemsLine || !itemsLine.trim()) return []
  try {
    const parsed = JSON.parse(itemsLine.trim())
    if (!Array.isArray(parsed)) return []
    return (parsed as Array<Record<string, unknown>>)
      .map((entry) => ({
        title: typeof entry?.title === 'string' ? entry.title : '',
        amount: Number(entry?.amount),
      }))
      .filter(
        (item) => item.title.trim().length > 0 && !Number.isNaN(item.amount),
      )
  } catch {
    return []
  }
}

export async function extractExpenseInformationFromImage(imageUrl: string) {
  'use server'
  const categories = await getCategories()

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: getAIModel('receiptExtract'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
              This image contains a receipt.
              Read the total amount and store it as a non-formatted number without any other text or currency.
              Then guess the category for this receipt among the following categories and store its ID: ${categories.map(
                (category) => formatCategoryForAIPrompt(category),
              )}.
              Guess the expense’s date and store it as yyyy-mm-dd.
              Guess a title for the expense.
              On the FIRST line, return the amount, the category, the date and the title with just a comma between them, without anything else.
              If the receipt clearly lists individual line items, on a SECOND line return a JSON array of the items as [{"title":"...","amount":0.00}, ...] using non-formatted numbers. If you cannot read individual items, omit the second line entirely.`,
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: imageUrl } }],
      },
    ],
  }
  const openai = getAIClient()
  const completion = await openai.chat.completions.create(body)

  const content = completion.choices.at(0)?.message.content ?? ''
  const [firstLine, ...restLines] = content.split('\n')
  const [amountString, categoryId, date, title] = firstLine?.split(',') ?? [
    null,
    null,
    null,
    null,
  ]
  const items = parseReceiptItems(restLines.join('\n'))

  return { amount: Number(amountString), categoryId, date, title, items }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>
