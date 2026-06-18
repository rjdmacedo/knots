'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm } from 'react-hook-form'

const categoryItems = [
  { label: 'Food', value: 'food' },
  { label: 'Transport', value: 'transport' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Other', value: 'other' },
]

const participantItems = Array.from({ length: 8 }, (_, i) => ({
  label: `Participant ${i + 1}`,
  value: `p${i + 1}`,
}))

const recurrenceItems = [
  { label: 'None', value: 'NONE' },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
]

/**
 * Step 20: Base UI Select + Base UI Checkbox + 10 inputs.
 * Using the new Base UI Select API with items prop.
 */
export function ExpenseFormTest() {
  const form = useForm({
    defaultValues: {
      ...Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`field${i + 1}`, '']),
      ),
      category: null as string | null,
      paidBy: null as string | null,
      recurrence: 'NONE',
      check1: false,
      check2: false,
      check3: false,
      check4: false,
      check5: false,
      check6: false,
      check7: false,
      check8: false,
    },
  })

  const onSubmit = (values: any) => {
    alert(JSON.stringify(values, null, 2))
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Step 20 - Base UI Select + Checkbox</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {Array.from({ length: 10 }, (_, i) => (
              <FormField
                key={i}
                control={form.control}
                name={`field${i + 1}` as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Input {i + 1}</FormLabel>
                    <FormControl>
                      <Input
                        className="text-base"
                        placeholder="Type here..."
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}

            {/* Base UI Select - Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select items={categoryItems} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose category..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Categories</SelectLabel>
                        {categoryItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Base UI Select - Paid by */}
            <FormField
              control={form.control}
              name="paidBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <Select items={participantItems} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose participant..." />
                    </SelectTrigger>
                    <SelectContent>
                      {participantItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Base UI Select - Recurrence */}
            <FormField
              control={form.control}
              name="recurrence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurrence</FormLabel>
                  <Select items={recurrenceItems} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="NONE" />
                    </SelectTrigger>
                    <SelectContent>
                      {recurrenceItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* 8 Base UI Checkboxes */}
            <div className="space-y-3 pt-4 border-t">
              <span className="text-sm font-medium">Checkboxes</span>
              {Array.from({ length: 8 }, (_, i) => (
                <FormField
                  key={`chk-${i}`}
                  control={form.control}
                  name={`check${i + 1}` as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value as boolean}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Checkbox {i + 1}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex mt-4 gap-2">
          <Button type="submit">Submit</Button>
        </div>
      </form>
    </Form>
  )
}
