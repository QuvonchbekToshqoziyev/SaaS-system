type DisplayTransaction = {
  firmId?: string | null;
  payerFirmId?: string | null;
  receiverFirmId?: string | null;
  payerFirm?: { id?: string; name?: string | null } | null;
  receiverFirm?: { id?: string; name?: string | null } | null;
  paymentMethod?: string | null;
  paymentCard?: { ownerName?: string | null; cardNumber?: string | null; status?: string | null } | null;
  cardNameSnapshot?: string | null;
  cardMaskedNumberSnapshot?: string | null;
  counterpartyNameSnapshot?: string | null;
  metadata?: unknown;
};

const metadata = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => String(value || '').trim();

export function maskCardNumber(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `**** **** **** ${digits.slice(-4).padStart(4, '*')}` : '';
}

export function kassaTransactionDisplay(tx: DisplayTransaction, flow: 'IN' | 'OUT' | null) {
  const meta = metadata(tx.metadata);
  const relation = flow === 'IN' ? tx.payerFirm : flow === 'OUT' ? tx.receiverFirm : null;
  const counterpartyName = text(relation?.name)
    || text(tx.counterpartyNameSnapshot)
    || text(meta.employeeName || meta.founderName || meta.customerName || meta.purchaserName)
    || text(meta.counterpartyLabel || meta.counterpartyName || meta.payerLabel || meta.receiverLabel || meta.manualCounterparty)
    || 'Ko‘rsatilmagan';
  const counterpartyId = text(relation?.id || (flow === 'IN' ? tx.payerFirmId : tx.receiverFirmId)) || null;
  const counterpartyType = text(meta.counterpartyType || meta.counterpartyKind) || (relation ? 'FIRM' : 'OTHER');
  const cardName = text(tx.cardNameSnapshot || tx.paymentCard?.ownerName || meta.paymentCardOwner);
  const cardMaskedNumber = text(tx.cardMaskedNumberSnapshot) || maskCardNumber(tx.paymentCard?.cardNumber || meta.paymentCardNumber);
  const inactive = tx.paymentCard && text(tx.paymentCard.status).toUpperCase() !== 'ACTIVE' ? ' — nofaol' : '';
  const cardDisplayName = cardName ? `${cardName}${cardMaskedNumber ? ` • ${cardMaskedNumber.slice(-4)}` : ''}${inactive}` : null;
  const note = text(meta.note || meta.reference);
  return {
    counterpartyType,
    counterpartyId,
    counterpartyName,
    directionLabel: flow === 'IN' ? `Kimdan: ${counterpartyName}` : flow === 'OUT' ? `Kimga: ${counterpartyName}` : counterpartyName,
    cardDisplayName,
    cardMaskedNumber: cardMaskedNumber || null,
    note,
  };
}
