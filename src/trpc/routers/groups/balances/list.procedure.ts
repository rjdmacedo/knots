import { getGroup, getGroupExpenses } from '@/lib/api'
import { getPublicBalances, getReimbursements } from '@/lib/balances'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupBalancesProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => {
    const [group, expenses] = await Promise.all([
      getGroup(groupId),
      getGroupExpenses(groupId),
    ])
    const reimbursements = getReimbursements(expenses, {
      simplifyDebts: group?.simplifyDebts ?? true,
    })
    const publicBalances = getPublicBalances(reimbursements)

    return { balances: publicBalances, reimbursements }
  })
