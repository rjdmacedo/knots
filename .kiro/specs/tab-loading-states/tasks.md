# Implementation Plan: Tab Loading States

## Overview

Implementação de estados de carregamento visuais (skeleton placeholders) na área de conteúdo principal durante navegações entre páginas. A abordagem é incremental: primeiro os componentes de skeleton, depois o hook de navegação, seguido dos ficheiros `loading.tsx` por rota, e finalmente a integração no layout existente.

## Tasks

- [x] 1. Criar componentes de skeleton reutilizáveis

  - [x] 1.1 Criar `ListSkeleton` component

    - Criar ficheiro `src/components/skeletons/list-skeleton.tsx`
    - Implementar skeleton com items empilhados verticalmente usando o componente `Skeleton` existente de `src/components/ui/skeleton.tsx`
    - Aceitar prop `itemCount` (default: 5) para número de items
    - Cada item deve ter `aria-hidden="true"` nos elementos decorativos
    - Container deve ter `aria-label` descritivo e `data-slot="skeleton"` em cada placeholder
    - _Requirements: 2.1, 2.4, 3.1, 5.2_

  - [x] 1.2 Criar `CardsSkeleton` component

    - Criar ficheiro `src/components/skeletons/cards-skeleton.tsx`
    - Implementar skeleton com blocos retangulares representando cards usando o componente `Skeleton` existente
    - Aceitar prop `cardCount` (default: 3)
    - Aplicar `aria-hidden="true"` nos elementos decorativos e `data-slot="skeleton"` em cada placeholder
    - _Requirements: 2.2, 2.4, 3.1, 5.2_

  - [x] 1.3 Criar `ChartsSkeleton` component

    - Criar ficheiro `src/components/skeletons/charts-skeleton.tsx`
    - Implementar skeleton com retângulo largo (gráfico) e blocos menores (totais) usando o componente `Skeleton` existente
    - Aplicar `aria-hidden="true"` nos elementos decorativos e `data-slot="skeleton"` em cada placeholder
    - _Requirements: 2.3, 2.4, 3.1, 5.2_

  - [x] 1.4 Criar `GenericSkeleton` component

    - Criar ficheiro `src/components/skeletons/generic-skeleton.tsx`
    - Implementar skeleton fallback com mínimo 3 skeletons de linha + 1 skeleton de bloco usando o componente `Skeleton` existente
    - Aplicar `aria-hidden="true"` nos elementos decorativos e `data-slot="skeleton"` em cada placeholder
    - _Requirements: 2.6, 3.1, 5.2_

  - [x] 1.5 Criar `LoadingError` component

    - Criar ficheiro `src/components/loading-error.tsx`
    - Implementar variante `warning` (mensagem informativa) e variante `error` (com botões retry/cancel)
    - Incluir `aria-live="polite"` para anúncio a tecnologias assistivas
    - _Requirements: 1.4, 5.4, 6.2, 6.3_

  - [x] 1.6 Criar função utilitária `getSkeletonForTab`

    - Criar ficheiro `src/components/skeletons/get-skeleton-for-tab.ts`
    - Implementar mapeamento de tab name para componente de skeleton correspondente
    - Retornar `GenericSkeleton` para tabs não mapeadas
    - Exportar tipo `TabName`
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]\* 1.7 Write property test: Skeleton composition uses only Skeleton component

    - **Property 1: Skeleton composition uses only Skeleton component**
    - Criar ficheiro `src/components/skeletons/__tests__/skeleton-composition.property.test.tsx`
    - Gerar variantes de tab aleatórias com fast-check, renderizar, verificar que todos os elementos placeholder têm `data-slot="skeleton"`
    - Mínimo 100 iterações
    - **Validates: Requirements 3.1**

  - [ ]\* 1.8 Write property test: Accessibility attributes on skeleton variants
    - **Property 3: Accessibility attributes on skeleton variants**
    - Criar ficheiro `src/components/skeletons/__tests__/skeleton-accessibility.property.test.tsx`
    - Gerar variantes de tab aleatórias com fast-check, verificar `aria-label` não vazio no container e `aria-hidden="true"` nos filhos decorativos
    - Mínimo 100 iterações
    - **Validates: Requirements 5.2**

- [x] 2. Checkpoint - Verificar componentes de skeleton

  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implementar hook `useNavigationLoading`

  - [x] 3.1 Criar hook `useNavigationLoading`

    - Criar ficheiro `src/lib/use-navigation-loading.ts`
    - Implementar escuta de eventos de navegação do Next.js router
    - Integrar `spin-delay` para debounce de 200ms (não mostrar loading em navegações rápidas)
    - Implementar gestão de timers: warning (10s) e error (30s)
    - Implementar cancelamento de navegação anterior quando nova é iniciada
    - Expor interface `NavigationLoadingState` com `isLoading`, `isTimeout`, `isError`, `targetTab`, `cancel()`, `retry()`
    - Garantir cleanup de todos os timers no `useEffect` cleanup
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.2, 6.2, 6.3_

  - [ ]\* 3.2 Write unit tests for `useNavigationLoading`

    - Criar ficheiro `src/lib/__tests__/use-navigation-loading.test.ts`
    - Testar: spin-delay não mostra loading em navegações <200ms
    - Testar: timeout warning aos 10s
    - Testar: timeout error aos 30s
    - Testar: cancelamento de navegação anterior
    - Testar: cleanup de timers em unmount
    - _Requirements: 1.3, 1.4, 4.2, 6.2, 6.3_

  - [ ]\* 3.3 Write property test: Navigation superseding shows only latest skeleton
    - **Property 2: Navigation superseding shows only latest skeleton**
    - Criar ficheiro `src/lib/__tests__/navigation-superseding.property.test.ts`
    - Gerar sequências aleatórias de navegações rápidas com fast-check, verificar que apenas o último skeleton é visível e estados anteriores são cancelados
    - Mínimo 100 iterações
    - **Validates: Requirements 4.2**

- [x] 4. Checkpoint - Verificar hook de navegação

  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Criar `TabLoadingContainer` e ficheiros `loading.tsx`

  - [x] 5.1 Criar `TabLoadingContainer` component

    - Criar ficheiro `src/components/tab-loading-container.tsx`
    - Implementar wrapper que aplica `aria-busy="true"` quando em loading
    - Remover `aria-busy` quando conteúdo está pronto
    - Renderizar skeleton contextual via `getSkeletonForTab` ou conteúdo
    - Integrar `LoadingError` para estados de timeout (warning e error)
    - Garantir que `aria-busy` é removido em unmount via `useEffect` cleanup
    - Garantir que loading state fica abaixo da Progress_Bar na hierarquia visual (z-index)
    - _Requirements: 1.1, 1.2, 5.1, 5.3, 6.4_

  - [x] 5.2 Criar ficheiros `loading.tsx` para cada rota de tab
    - Criar `src/app/groups/[groupId]/expenses/loading.tsx` → exportar `ListSkeleton`
    - Criar `src/app/groups/[groupId]/activity/loading.tsx` → exportar `ListSkeleton`
    - Criar `src/app/groups/[groupId]/balances/loading.tsx` → exportar `CardsSkeleton`
    - Criar `src/app/groups/[groupId]/information/loading.tsx` → exportar `CardsSkeleton`
    - Criar `src/app/groups/[groupId]/stats/loading.tsx` → exportar `ChartsSkeleton`
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

- [x] 6. Integração no layout existente

  - [x] 6.1 Integrar `TabLoadingContainer` no `GroupLayoutClient`

    - Modificar `src/app/groups/[groupId]/layout.client.tsx`
    - Envolver `{children}` com `TabLoadingContainer`
    - Passar estado de loading do hook `useNavigationLoading` e tab ativa
    - Garantir que header e navegação permanecem visíveis e nas posições originais durante loading
    - Garantir que tabs permanecem clicáveis e com mesmo estilo visual durante loading (não disabled, não esmaecidos)
    - _Requirements: 3.3, 4.1, 4.3_

  - [ ]\* 6.2 Write integration tests for tab loading states
    - Criar ficheiro `src/app/groups/[groupId]/__tests__/tab-loading-states.test.tsx`
    - Testar: aria-busy lifecycle (adicionado no início, removido no fim)
    - Testar: navegação permanece interativa durante loading
    - Testar: header/nav estabilidade durante loading
    - Testar: skeleton correto é renderizado para cada tab
    - Testar: loading state não sobrepõe progress bar
    - _Requirements: 4.1, 4.3, 5.1, 5.3, 3.3, 6.4_

- [x] 7. Fix tsc and prettier

  - Run `npx tsc --noEmit` and fix any TypeScript compilation errors in the new/modified files
  - Run `npx prettier --write` on all new/modified files to ensure formatting compliance
  - Files to check: `src/components/skeletons/*.tsx`, `src/components/skeletons/*.ts`, `src/components/loading-error.tsx`, `src/components/tab-loading-container.tsx`, `src/lib/use-navigation-loading.ts`, `src/app/groups/[groupId]/layout.client.tsx`, `src/app/groups/[groupId]/*/loading.tsx`

- [x] 8. Final checkpoint - Verificar integração completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser ignoradas para um MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Property tests validam propriedades universais de corretude
- Unit tests validam exemplos específicos e edge cases
- O projeto já tem `spin-delay` e `fast-check` instalados — não é necessário adicionar dependências
- O componente `Skeleton` existente em `src/components/ui/skeleton.tsx` é a base para todos os skeletons

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "3.1"] },
    { "id": 2, "tasks": ["1.7", "1.8", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8"] }
  ]
}
```
