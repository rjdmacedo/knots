import { createTRPCRouter } from '@/trpc/init'
import { addGroupExpenseDocumentsProcedure } from '@/trpc/routers/groups/expenses/add-documents.procedure'
import { createGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/create.procedure'
import { deleteGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/delete.procedure'
import { getGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/get.procedure'
import { importKnotsProcedure } from '@/trpc/routers/groups/expenses/import-knots.procedure'
import { importSplitwiseCSVProcedure } from '@/trpc/routers/groups/expenses/import-splitwise.procedure'
import { listGroupExpensesProcedure } from '@/trpc/routers/groups/expenses/list.procedure'
import { lookupCategoryMappingProcedure } from '@/trpc/routers/groups/expenses/lookup-category.procedure'
import { previewKnotsImportProcedure } from '@/trpc/routers/groups/expenses/preview-knots.procedure'
import { previewSplitwiseImportProcedure } from '@/trpc/routers/groups/expenses/preview-splitwise.procedure'
import { suggestExpenseTitlesProcedure } from '@/trpc/routers/groups/expenses/suggest-titles.procedure'
import { updateGroupExpenseCategoryProcedure } from '@/trpc/routers/groups/expenses/update-category.procedure'
import { updateGroupExpenseProcedure } from '@/trpc/routers/groups/expenses/update.procedure'

export const groupExpensesRouter = createTRPCRouter({
  list: listGroupExpensesProcedure,
  get: getGroupExpenseProcedure,
  create: createGroupExpenseProcedure,
  update: updateGroupExpenseProcedure,
  updateCategory: updateGroupExpenseCategoryProcedure,
  addDocuments: addGroupExpenseDocumentsProcedure,
  delete: deleteGroupExpenseProcedure,
  importSplitwise: importSplitwiseCSVProcedure,
  previewSplitwiseImport: previewSplitwiseImportProcedure,
  previewKnotsImport: previewKnotsImportProcedure,
  importKnots: importKnotsProcedure,
  lookupCategory: lookupCategoryMappingProcedure,
  suggestTitles: suggestExpenseTitlesProcedure,
})
