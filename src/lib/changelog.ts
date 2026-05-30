import fs from 'fs'
import path from 'path'

/** A single change item within a category */
export interface ChangeItem {
  /** The description text of the change */
  description: string
  /** Optional links found in the change item (commit hashes, issue refs) */
  links: Array<{ text: string; url: string }>
}

/** A category of changes (e.g., "Features", "Bug Fixes") */
export interface ChangeCategory {
  /** The category name */
  title: string
  /** The list of changes in this category */
  items: ChangeItem[]
}

/** A single release entry */
export interface ReleaseEntry {
  /** The version string (e.g., "1.22.1") */
  version: string
  /** The release date string (e.g., "2026-05-30") */
  date: string
  /** Optional URL linking to the comparison/release */
  url: string | null
  /** The categorized changes in this release */
  categories: ChangeCategory[]
}

/**
 * Parses a conventional-changelog formatted markdown string into structured data.
 * Skips malformed lines and continues parsing valid content.
 */
export function parseChangelog(markdown: string): ReleaseEntry[] {
  const entries: ReleaseEntry[] = []
  const lines = markdown.split('\n')

  let currentEntry: ReleaseEntry | null = null
  let currentCategory: ChangeCategory | null = null

  // Matches: ## [version](url) (date) or # [version](url) (date)
  // Also handles versions without URL: ## [version] (date) or # version (date)
  const versionHeadingRegex =
    /^#{1,2}\s+\[([^\]]+)\]\(([^)]*)\)\s*\(([^)]*)\)\s*$/
  const versionHeadingNoUrlRegex = /^#{1,2}\s+\[([^\]]+)\]\s*\(([^)]*)\)\s*$/
  const versionHeadingPlainRegex = /^#{1,2}\s+([^\s[#]+)\s*\(([^)]*)\)\s*$/

  // Matches: ### Category Name
  const categoryHeadingRegex = /^###\s+(.+)$/

  // Matches: * description or - description
  const listItemRegex = /^[*-]\s+(.+)$/

  // Matches inline links: [text](url)
  const inlineLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip blank lines
    if (trimmed === '') continue

    // Try to match version heading with URL
    let versionMatch = trimmed.match(versionHeadingRegex)
    if (versionMatch) {
      // Save current entry if exists
      if (currentEntry) {
        if (currentCategory && currentCategory.items.length > 0) {
          currentEntry.categories.push(currentCategory)
        }
        entries.push(currentEntry)
      }
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[3],
        url: versionMatch[2] || null,
        categories: [],
      }
      currentCategory = null
      continue
    }

    // Try version heading without URL: ## [version] (date)
    versionMatch = trimmed.match(versionHeadingNoUrlRegex)
    if (versionMatch) {
      if (currentEntry) {
        if (currentCategory && currentCategory.items.length > 0) {
          currentEntry.categories.push(currentCategory)
        }
        entries.push(currentEntry)
      }
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[2],
        url: null,
        categories: [],
      }
      currentCategory = null
      continue
    }

    // Try plain version heading: ## version (date)
    versionMatch = trimmed.match(versionHeadingPlainRegex)
    if (versionMatch) {
      if (currentEntry) {
        if (currentCategory && currentCategory.items.length > 0) {
          currentEntry.categories.push(currentCategory)
        }
        entries.push(currentEntry)
      }
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[2],
        url: null,
        categories: [],
      }
      currentCategory = null
      continue
    }

    // Try to match category heading
    const categoryMatch = trimmed.match(categoryHeadingRegex)
    if (categoryMatch && currentEntry) {
      if (currentCategory && currentCategory.items.length > 0) {
        currentEntry.categories.push(currentCategory)
      }
      currentCategory = {
        title: categoryMatch[1],
        items: [],
      }
      continue
    }

    // Try to match list item
    const listMatch = trimmed.match(listItemRegex)
    if (listMatch && currentEntry) {
      const content = listMatch[1]
      const links: Array<{ text: string; url: string }> = []

      // Extract all inline links
      let linkMatch: RegExpExecArray | null
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
      while ((linkMatch = linkRegex.exec(content)) !== null) {
        links.push({ text: linkMatch[1], url: linkMatch[2] })
      }

      // Build description by removing link markdown syntax
      const description = content
        .replace(inlineLinkRegex, '$1')
        .replace(/\s*\(\s*\)\s*/g, '')
        .trim()

      const item: ChangeItem = { description, links }

      if (currentCategory) {
        currentCategory.items.push(item)
      } else {
        // Item without a category - create an implicit "Uncategorized" category
        // or attach directly. Per spec, releases without categories are valid.
        // We'll create a default category to hold orphan items.
        currentCategory = { title: 'Other', items: [] }
        currentCategory.items.push(item)
      }
      continue
    }

    // Unrecognized line - skip silently
  }

  // Push the last entry
  if (currentEntry) {
    if (currentCategory && currentCategory.items.length > 0) {
      currentEntry.categories.push(currentCategory)
    }
    entries.push(currentEntry)
  }

  return entries
}

/**
 * Reads and parses the CHANGELOG.md file from the project root.
 * Returns an empty array if the file is missing or unreadable.
 */
export function getChangelogEntries(): ReleaseEntry[] {
  try {
    const filePath = path.join(process.cwd(), 'CHANGELOG.md')
    const content = fs.readFileSync(filePath, 'utf-8')
    return parseChangelog(content)
  } catch {
    return []
  }
}
