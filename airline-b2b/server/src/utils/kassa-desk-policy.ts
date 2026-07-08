export type KassaDeskSelection = {
  id: string;
  firmId: string;
  status?: string | null;
  deletedAt?: Date | string | null;
};

export function assertActiveKassaDesk(desk: KassaDeskSelection | null | undefined): asserts desk is KassaDeskSelection {
  if (!desk) throw new Error('Kassa desk not found');
  if (desk.status !== 'ACTIVE' || desk.deletedAt) throw new Error('Kassa desk is not active');
}

export function assertKassaDeskForFirmSelection(
  desk: KassaDeskSelection | null,
  firmId: string,
  activeDeskCount: number,
) {
  if (desk) {
    if (desk.firmId !== firmId) {
      throw new Error('Kassa desk must belong to the selected firm');
    }
    return;
  }

  if (activeDeskCount > 0) {
    throw new Error('Kassa desk is required for this firm');
  }
}

export function assertKassaDeskForFirmSetSelection(
  desk: KassaDeskSelection | null,
  firmIds: string[],
  requiredFirmId: string | undefined,
  requiredFirmActiveDeskCount: number,
) {
  const allowedFirmIds = firmIds.filter(Boolean);
  if (desk) {
    if (!allowedFirmIds.includes(desk.firmId)) {
      throw new Error('Kassa desk must belong to one of the transaction firms');
    }
    return;
  }

  if (requiredFirmId && requiredFirmActiveDeskCount > 0) {
    throw new Error('Kassa desk is required for this firm');
  }
}
