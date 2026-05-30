import type { ChangeCategory, ChangeItem, ReleaseEntry } from '@/lib/changelog'

interface ChangelogContentProps {
  entries: ReleaseEntry[]
}

function ChangeItemLink({ text, url }: { text: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}

function ChangeItemRow({ item }: { item: ChangeItem }) {
  return (
    <li>
      {item.description}
      {item.links.length > 0 && (
        <>
          {' '}
          (
          {item.links.map((link, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <ChangeItemLink text={link.text} url={link.url} />
            </span>
          ))}
          )
        </>
      )}
    </li>
  )
}

function ChangeCategorySection({ category }: { category: ChangeCategory }) {
  return (
    <section>
      <h3>{category.title}</h3>
      <ul>
        {category.items.map((item, i) => (
          <ChangeItemRow key={i} item={item} />
        ))}
      </ul>
    </section>
  )
}

function formatDate(date: string): string {
  const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (parts) {
    return `${parts[3]}-${parts[2]}-${parts[1]}`
  }
  return date
}

function ReleaseSection({ entry }: { entry: ReleaseEntry }) {
  return (
    <section>
      <h2>
        {entry.url ? (
          <a href={entry.url} target="_blank" rel="noopener noreferrer">
            {entry.version}
          </a>
        ) : (
          entry.version
        )}
        {entry.date && (
          <span className="ml-3 text-base font-normal text-muted-foreground">
            ({formatDate(entry.date)})
          </span>
        )}
      </h2>
      {entry.categories.map((category, i) => (
        <ChangeCategorySection key={i} category={category} />
      ))}
    </section>
  )
}

export function ChangelogContent({ entries }: ChangelogContentProps) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground">
        The changelog could not be loaded.
      </p>
    )
  }

  return (
    <div className="prose dark:prose-invert max-w-none">
      {entries.map((entry, i) => (
        <ReleaseSection key={i} entry={entry} />
      ))}
    </div>
  )
}
