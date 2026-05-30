# Implementation Plan: Changelog Page

## Overview

Implement a statically generated changelog page at `/changelog` that reads the project's `CHANGELOG.md` at build time, parses it into structured data using a custom parser module, and renders it as well-formatted HTML using Tailwind Typography. The implementation is split into a parser module (`src/lib/changelog.ts`), a page component (`src/app/changelog/page.tsx`), and a content rendering component (`src/app/changelog/_components/changelog-content.tsx`).

## Tasks

- [x] 1. Implement the changelog parser module

  - [x] 1.1 Create the parser module with types and parsing logic at `src/lib/changelog.ts`

    - Define the `ChangeItem`, `ChangeCategory`, and `ReleaseEntry` interfaces
    - Implement `parseChangelog(markdown: string): ReleaseEntry[]` as a pure function that handles both `##` and `#` version headings, `###` category headings, and `*` or `-` list items with inline links
    - Implement `getChangelogEntries(): ReleaseEntry[]` that reads `CHANGELOG.md` from the project root using `fs.readFileSync`, wrapped in try/catch returning `[]` on failure
    - Handle edge cases: missing file, empty file, malformed lines (skip silently), releases without categories, items without links
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]\* 1.2 Write unit tests for the changelog parser

    - Create `src/lib/changelog.test.ts`
    - Test parsing of known markdown snippets with correct extraction of versions, dates, categories, and items
    - Test edge cases: empty string, missing file, malformed lines, releases without categories, items without links, version headings without dates
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]\* 1.3 Write property test for parser structural round-trip

    - Create `src/lib/changelog.property.test.ts`
    - **Property 1: Parser structural round-trip**
    - Generate random `ReleaseEntry[]` structures using fast-check arbitraries, serialize them to conventional-changelog markdown format, parse back with `parseChangelog`, and verify structural equivalence (same number of releases, versions, dates, category names, item counts, and link URLs)
    - Use `{ numRuns: 100 }` configuration
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.3**

  - [ ]\* 1.4 Write property test for parser resilience to malformed input
    - Add to `src/lib/changelog.property.test.ts`
    - **Property 2: Parser resilience to malformed input**
    - Generate valid conventional-changelog markdown, insert random non-conforming lines at random positions, verify the parser extracts the same set of valid release entries as from the clean markdown
    - Use `{ numRuns: 100 }` configuration
    - **Validates: Requirements 2.4**

- [x] 2. Checkpoint - Ensure parser tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement the changelog page and content component

  - [x] 3.1 Create the `ChangelogContent` component at `src/app/changelog/_components/changelog-content.tsx`

    - Accept `entries: ReleaseEntry[]` as props
    - Render each `ReleaseEntry` with version as `<h2>` and date in secondary text style adjacent to the version
    - Render each `ChangeCategory` as `<h3>` sub-headings beneath the release heading
    - Render each `ChangeItem` as `<li>` within `<ul>` containers
    - Render links with `target="_blank"` and `rel="noopener noreferrer"` attributes
    - Apply Tailwind Typography `prose` classes for consistent styling
    - Handle empty entries array with a "changelog could not be loaded" message
    - Handle releases with no categories (render version/date heading only)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 1.4_

  - [x] 3.2 Create the changelog page at `src/app/changelog/page.tsx`

    - Export default `ChangelogPage` server component that calls `getChangelogEntries()` and passes entries to `ChangelogContent`
    - Export `metadata` object with title containing "Changelog" and app name, meta description (max 160 chars), Open Graph tags (og:title, og:description, og:type), and Twitter Card tags
    - Render an `<h1>` heading with text "Changelog" above the content
    - Constrain content area to a max width consistent with other pages, centered horizontally with at least 16px horizontal padding
    - Ensure responsive layout: full available width minus padding on viewports < 640px
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 5.1_

  - [ ]\* 3.3 Write property test for link attribute correctness

    - Add to `src/lib/changelog.property.test.ts` (or create `src/app/changelog/_components/changelog-content.test.tsx`)
    - **Property 3: Link attribute correctness**
    - Generate `ChangeItem` arrays with random links, render the `ChangelogContent` component, verify every `<a>` element has `target="_blank"` and `rel="noopener noreferrer"` attributes
    - Use `{ numRuns: 100 }` configuration
    - **Validates: Requirements 3.4**

  - [ ]\* 3.4 Write unit tests for the page and content component
    - Create `src/app/changelog/_components/changelog-content.test.tsx`
    - Test rendering with sample data: verify h2 for versions, h3 for categories, ul/li for items, prose classes applied
    - Test empty state rendering (empty entries array shows fallback message)
    - Test metadata export contains required SEO fields
    - _Requirements: 1.2, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project already uses `fast-check` (v4.8.0) and Jest with jsdom environment
- The existing `src/lib/activity-diff.property.test.ts` serves as a reference for property test conventions (200 numRuns, describe/it blocks, fc.assert with fc.property)
- The page uses Next.js static generation by default (server component with no dynamic data)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4"] }
  ]
}
```
