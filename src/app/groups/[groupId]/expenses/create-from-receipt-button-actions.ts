'use server'
import { getAIClient, getAIModel } from '@/lib/ai-client'
import { getCategories } from '@/lib/api'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.mjs'

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
              Return the amount, the category, the date and the title with just a comma between them, without anything else.`,
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

  const [amountString, categoryId, date, title] = completion.choices
    .at(0)
    ?.message.content?.split(',') ?? [null, null, null, null]
  return { amount: Number(amountString), categoryId, date, title }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>
