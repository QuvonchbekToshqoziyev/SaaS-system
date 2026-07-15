import { FinancialAccountType, Prisma } from '@prisma/client';
import { prisma } from '../db';

export function financialAccountUniqueWhere(input: {
  firmId: string; name: string; currency: string; kassaDeskId?: string | null; paymentCardId?: string | null;
}): Prisma.FinancialAccountWhereUniqueInput {
  if (input.kassaDeskId) return { kassaDeskId_currency: { kassaDeskId: input.kassaDeskId, currency: input.currency } };
  if (input.paymentCardId) return { paymentCardId_currency: { paymentCardId: input.paymentCardId, currency: input.currency } };
  return { firmId_name_currency: { firmId: input.firmId, name: input.name, currency: input.currency } };
}

export async function ensureFinancialAccount(input: {
  firmId: string; currency: string; type: FinancialAccountType; name?: string;
  kassaDeskId?: string | null; paymentCardId?: string | null; createdByUserId?: string;
}) {
  let name = input.name?.trim();
  if (!name && input.kassaDeskId) name = `Kassa: ${(await prisma.kassaDesk.findUnique({ where: { id: input.kassaDeskId }, select: { name: true } }))?.name || input.kassaDeskId}`;
  if (!name && input.paymentCardId) name = `Karta: ${(await prisma.paymentCard.findUnique({ where: { id: input.paymentCardId }, select: { ownerName: true } }))?.ownerName || input.paymentCardId}`;
  name ||= input.type === FinancialAccountType.BANK ? 'Main account' : input.type;
  return prisma.financialAccount.upsert({
    where: financialAccountUniqueWhere({ ...input, name }),
    create: { firmId: input.firmId, name, currency: input.currency, type: input.type, kassaDeskId: input.kassaDeskId || undefined, paymentCardId: input.paymentCardId || undefined, createdByUserId: input.createdByUserId },
    update: { status: 'ACTIVE', kassaDeskId: input.kassaDeskId || undefined, paymentCardId: input.paymentCardId || undefined },
  });
}
