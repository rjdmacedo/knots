import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { filterExpenseCategories } from '@/lib/categories'
import { useMediaQuery } from '@/lib/hooks'
import { Category } from '@prisma/client'
import { useIsClient } from 'foxact/use-is-client'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

type Props = {
  categories: Category[]
  onValueChange: (categoryId: Category['id']) => void
  /** Category ID to be selected by default. Overwriting this value will update current selection, too. */
  defaultValue: Category['id']
  isLoading: boolean
}

type CategoryGroup = {
  value: string
  items: Category[]
}

function getCategoryGroups(categories: Category[]): CategoryGroup[] {
  const selectableCategories = filterExpenseCategories(categories)
  const categoriesByGroup = selectableCategories.reduce<
    Record<string, Category[]>
  >(
    (acc, category) => ({
      ...acc,
      [category.grouping]: [...(acc[category.grouping] ?? []), category],
    }),
    {},
  )

  return Object.entries(categoriesByGroup).map(([group, items]) => ({
    value: group,
    items,
  }))
}

function getSelectedCategory(categories: Category[], value: Category['id']) {
  const selectableCategories = filterExpenseCategories(categories)
  return (
    categories.find((category) => category.id === value) ??
    selectableCategories[0] ??
    categories[0]
  )
}

function isCategory(value: unknown): value is Category {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'grouping' in value &&
    'name' in value
  )
}

export function CategorySelector({
  categories,
  onValueChange,
  defaultValue,
  isLoading,
}: Props) {
  const [value, setValue] = useState<number>(defaultValue)
  const isClient = useIsClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // allow overwriting currently selected category from outside
  useEffect(() => {
    setValue(defaultValue)
    onValueChange(defaultValue)
  }, [defaultValue])

  if (!isClient || !isDesktop) {
    return (
      <CategorySelect
        categories={categories}
        value={value}
        onValueChange={(id) => {
          setValue(id)
          onValueChange(id)
        }}
        isLoading={isLoading}
      />
    )
  }

  return (
    <CategoryCombobox
      categories={categories}
      value={value}
      onValueChange={(id) => {
        setValue(id)
        onValueChange(id)
      }}
      isLoading={isLoading}
    />
  )
}

function CategoryCombobox({
  categories,
  value,
  onValueChange,
  isLoading,
}: {
  categories: Category[]
  value: Category['id']
  onValueChange: (categoryId: Category['id']) => void
  isLoading: boolean
}) {
  const t = useTranslations('Categories')
  const categoryGroups = useMemo(
    () => getCategoryGroups(categories),
    [categories],
  )
  const selectedCategory = getSelectedCategory(categories, value)

  return (
    <Combobox
      items={categoryGroups}
      value={selectedCategory}
      onValueChange={(category) => {
        if (isCategory(category)) {
          onValueChange(category.id)
        }
      }}
      itemToStringLabel={(item) => {
        if (isCategory(item)) {
          return t(`${item.grouping}.${item.name}`)
        }
        return ''
      }}
      isItemEqualToValue={(a, b) => a.id === b.id}
      disabled={isLoading}
      autoHighlight
    >
      <ComboboxInput
        className="w-full [&_[data-slot=input-group-control]]:focus-visible:ring-inset"
        showTrigger
        showClear={false}
        placeholder={t('search')}
      />
      <ComboboxContent side="bottom" align="start">
        <ComboboxEmpty>{t('noCategory')}</ComboboxEmpty>
        <ComboboxList>
          {(group, index) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{t(`${group.value}.heading`)}</ComboboxLabel>
              <ComboboxCollection>
                {(category) => (
                  <ComboboxItem key={category.id} value={category}>
                    <CategoryLabel category={category} />
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {index < categoryGroups.length - 1 ? <ComboboxSeparator /> : null}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function CategorySelect({
  categories,
  value,
  onValueChange,
  isLoading,
}: {
  categories: Category[]
  value: Category['id']
  onValueChange: (categoryId: Category['id']) => void
  isLoading: boolean
}) {
  const t = useTranslations('Categories')
  const categoryGroups = useMemo(
    () => getCategoryGroups(categories),
    [categories],
  )
  const selectedCategory = getSelectedCategory(categories, value)

  return (
    <Select
      value={value}
      onValueChange={(categoryId) => {
        if (categoryId != null) onValueChange(categoryId)
      }}
      disabled={isLoading}
    >
      <SelectTrigger className="w-full focus-visible:ring-inset">
        <SelectValue>
          <CategoryLabel category={selectedCategory} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {categoryGroups.map((group) => (
          <SelectGroup key={group.value}>
            <SelectLabel>{t(`${group.value}.heading`)}</SelectLabel>
            {group.items.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <CategoryLabel category={category} />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CategoryCommand({
  categories,
  onValueChange,
}: {
  categories: Category[]
  onValueChange: (categoryId: Category['id']) => void
}) {
  const t = useTranslations('Categories')
  const categoryGroups = useMemo(
    () => getCategoryGroups(categories),
    [categories],
  )

  return (
    <Command>
      <CommandInput autoFocus placeholder={t('search')} className="text-base" />
      <CommandList className="max-h-[300px]">
        <CommandEmpty>{t('noCategory')}</CommandEmpty>
        {categoryGroups.map((group) => (
          <CommandGroup key={group.value} heading={t(`${group.value}.heading`)}>
            {group.items.map((category) => (
              <CommandItem
                key={category.id}
                value={`${category.id} ${t(
                  `${category.grouping}.heading`,
                )} ${t(`${category.grouping}.${category.name}`)}`}
                onSelect={(currentValue) => {
                  const id = Number(currentValue.split(' ')[0])
                  onValueChange(id)
                }}
              >
                <CategoryLabel category={category} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

function CategoryLabel({ category }: { category?: Category }) {
  const t = useTranslations('Categories')
  if (!category) {
    return (
      <div className="flex items-center gap-3">
        <CategoryIcon category={null} className="w-4 h-4 animate-pulse" />
        <span className="text-muted-foreground">...</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <CategoryIcon category={category} className="w-4 h-4" />
      {t(`${category.grouping}.${category.name}`)}
    </div>
  )
}
