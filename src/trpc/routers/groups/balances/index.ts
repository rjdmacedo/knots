import { createTRPCRouter } from '@/trpc/init'
import { listGroupBalancesProcedure } from '@/trpc/routers/groups/balances/list.procedure'
import { recordSettlementProcedure } from '@/trpc/routers/groups/balances/record-settlement.procedure'
import { requestPaymentProcedure } from '@/trpc/routers/groups/balances/request-payment.procedure'

export const groupBalancesRouter = createTRPCRouter({
  list: listGroupBalancesProcedure,
  requestPayment: requestPaymentProcedure,
  recordSettlement: recordSettlementProcedure,
})
