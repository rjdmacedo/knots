import { createTRPCRouter } from '@/trpc/init'
import { addMemberProcedure } from './add.procedure'
import { demoteMemberProcedure } from './demote.procedure'
import { leaveProcedure } from './leave.procedure'
import { promoteMemberProcedure } from './promote.procedure'
import { removeMemberProcedure } from './remove.procedure'

export const membersRouter = createTRPCRouter({
  add: addMemberProcedure,
  remove: removeMemberProcedure,
  leave: leaveProcedure,
  promote: promoteMemberProcedure,
  demote: demoteMemberProcedure,
})
