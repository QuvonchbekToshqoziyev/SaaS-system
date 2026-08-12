import { prisma } from '../../db';
import { visibleTransactionWhere } from '../../utils/transaction-visibility';
import { listMonthlyFeatureUsage } from '../../services/feature-usage.service';

const DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function rollingRetention(rows: Array<{ firmId: string; createdAt: Date }>, now: Date, days: number) {
  const currentStart = new Date(now.getTime() - days * DAY);
  const previousStart = new Date(now.getTime() - days * 2 * DAY);
  const current = new Set(rows.filter((row) => row.createdAt >= currentStart && row.createdAt <= now).map((row) => row.firmId));
  const previous = new Set(rows.filter((row) => row.createdAt >= previousStart && row.createdAt < currentStart).map((row) => row.firmId));
  const retained = [...previous].filter((firmId) => current.has(firmId)).length;
  return { retained, eligible: previous.size, rate: percent(retained, previous.size) };
}

function subscriptionWasExtended(before: unknown, after: unknown) {
  const previous = before && typeof before === 'object' ? (before as Record<string, unknown>).subscriptionEndsAt : null;
  const next = after && typeof after === 'object' ? (after as Record<string, unknown>).subscriptionEndsAt : null;
  const previousTime = previous ? new Date(String(previous)).getTime() : NaN;
  const nextTime = next ? new Date(String(next)).getTime() : NaN;
  return Number.isFinite(nextTime) && (!Number.isFinite(previousTime) || nextTime > previousTime);
}

export async function buildProductMetrics(now = new Date()) {
  const today = startOfUtcDay(now);
  const weekStart = new Date(today.getTime() - 6 * DAY);
  const monthStart = new Date(today.getTime() - 29 * DAY);
  const featureUsageMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const historyStart = new Date(today.getTime() - 180 * DAY);

  const [firms, activity, firstTransactions, kassaDays, supportQuestions, corrections, transfers, renewalLogs, featureUsage] = await Promise.all([
    prisma.firm.findMany({
      where: { deletedAt: null, status: { not: 'DELETED' } },
      select: { id: true, name: true, createdAt: true, subscriptionEndsAt: true },
    }),
    prisma.transaction.findMany({
      where: visibleTransactionWhere({ createdAt: { gte: historyStart, lte: now } }),
      select: { firmId: true, createdAt: true },
    }),
    prisma.transaction.groupBy({ by: ['firmId'], where: visibleTransactionWhere(), _min: { createdAt: true }, _count: { _all: true } }),
    prisma.kassaDay.findMany({
      where: { businessDate: { gte: weekStart, lte: today }, status: 'CLOSED' },
      select: { firmId: true, businessDate: true, cashDeskId: true },
    }),
    prisma.chatConversation.count({ where: { type: 'SUPPORT', createdAt: { gte: monthStart, lte: now } } }),
    prisma.auditLog.count({
      where: { entityType: 'transaction', action: { in: ['DELETE', 'SOFT_DELETE'] }, createdAt: { gte: monthStart, lte: now } },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'dataTransfer', action: { in: ['IMPORT', 'EXPORT'] }, createdAt: { gte: monthStart, lte: now } },
      select: { action: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'firm', action: 'UPDATE', createdAt: { gte: historyStart, lte: now } },
      select: { entityId: true, before: true, after: true },
    }),
    listMonthlyFeatureUsage(now),
  ]);

  const deskIds = [...new Set(kassaDays.map((row) => row.cashDeskId).filter((id): id is string => Boolean(id)))];
  const desks = deskIds.length
    ? await prisma.kassaDesk.findMany({ where: { id: { in: deskIds } }, select: { id: true, firmId: true } })
    : [];
  const deskFirm = new Map(desks.map((desk) => [desk.id, desk.firmId]));

  const weekActivity = activity.filter((row) => row.createdAt >= weekStart);
  const activeWeek = new Set(weekActivity.map((row) => row.firmId));
  const activeMonth = new Set(activity.filter((row) => row.createdAt >= monthStart).map((row) => row.firmId));
  const activityDays = new Map<string, Set<string>>();
  for (const row of weekActivity) {
    const days = activityDays.get(row.firmId) || new Set<string>();
    days.add(dateKey(row.createdAt));
    activityDays.set(row.firmId, days);
  }
  const frequentFirmIds = [...activityDays].filter(([, days]) => days.size >= 4).map(([firmId]) => firmId);

  const firstByFirm = new Map(firstTransactions.map((row) => [row.firmId, row]));
  const firstTransactionHours = firms.flatMap((firm) => {
    const first = firstByFirm.get(firm.id)?._min.createdAt;
    return first ? [Math.max(0, (first.getTime() - firm.createdAt.getTime()) / (60 * 60 * 1000))] : [];
  });

  const activeFirmDays = new Set(weekActivity.map((row) => `${row.firmId}:${dateKey(row.createdAt)}`));
  const closedFirmDays = new Set(kassaDays.flatMap((row) => {
    const firmId = row.firmId || (row.cashDeskId ? deskFirm.get(row.cashDeskId) : null);
    return firmId ? [`${firmId}:${dateKey(row.businessDate)}`] : [];
  }));
  const completedActiveDays = [...activeFirmDays].filter((key) => closedFirmDays.has(key)).length;

  const renewedFirmIds = new Set(renewalLogs.filter((row) => subscriptionWasExtended(row.before, row.after)).map((row) => row.entityId).filter(Boolean));
  const renewalEligible = firms.filter((firm) => firm.subscriptionEndsAt && firm.createdAt <= new Date(now.getTime() - 30 * DAY)).length;
  const subscribedNow = firms.filter((firm) => firm.subscriptionEndsAt && firm.subscriptionEndsAt > now).length;

  return {
    generatedAt: now.toISOString(),
    period: { weeklyFrom: dateKey(weekStart), monthlyFrom: dateKey(monthStart), to: dateKey(today) },
    goal: {
      targetPayingFirms: 20,
      activeSubscriptions: subscribedNow,
      targetFourDayUsageRate: 70,
      fourDayUsageRate: percent(frequentFirmIds.length, activeWeek.size),
      targetMet: subscribedNow >= 20 && percent(frequentFirmIds.length, activeWeek.size) >= 70,
      note: 'Active subscription is used as the current paying-firm proxy.',
    },
    engagement: {
      weeklyActiveFirms: activeWeek.size,
      firmsActiveAtLeastFourDays: frequentFirmIds.length,
      fourDayUsageRate: percent(frequentFirmIds.length, activeWeek.size),
      averageHoursToFirstTransaction: firstTransactionHours.length
        ? Math.round((firstTransactionHours.reduce((sum, value) => sum + value, 0) / firstTransactionHours.length) * 10) / 10
        : null,
      transactionsPerActiveFirm: activeWeek.size ? Math.round((weekActivity.length / activeWeek.size) * 10) / 10 : 0,
    },
    operations: {
      kassaClosingRate: percent(completedActiveDays, activeFirmDays.size),
      completedKassaFirmDays: completedActiveDays,
      activeFirmDays: activeFirmDays.size,
      spreadsheetImports30d: transfers.filter((row) => row.action === 'IMPORT').length,
      spreadsheetExports30d: transfers.filter((row) => row.action === 'EXPORT').length,
      supportQuestions30d: supportQuestions,
      supportQuestionsPerActiveFirm: activeMonth.size ? Math.round((supportQuestions / activeMonth.size) * 100) / 100 : 0,
      correctedOrReversedTransactions30d: corrections,
    },
    retention: {
      day30: rollingRetention(activity, now, 30),
      day60: rollingRetention(activity, now, 60),
      day90: rollingRetention(activity, now, 90),
      paidRenewal: { renewed: renewedFirmIds.size, eligible: renewalEligible, rate: percent(renewedFirmIds.size, renewalEligible), paymentVerified: false },
    },
    featureUsage: {
      month: dateKey(featureUsageMonthStart),
      rows: featureUsage,
      removalCandidates: featureUsage.filter((row) => row.uniqueFirms <= 1 && row.totalActions <= 3),
      note: 'Feature usage is buffered in memory and flushed to monthly counters, so user requests do not wait for telemetry database writes.',
    },
    definitions: {
      activeFirm: 'A firm with at least one transaction in the period.',
      kassaClosing: 'Active firm-days with a matching closed kassa day.',
      retention: 'Firms active in the previous rolling period that were also active in the current period.',
      renewal: 'A firm subscription end date extended through an audited update; payment is not yet independently verified.',
      featureUsage: 'Successful authenticated API requests grouped by feature, month, firm and user.',
    },
  };
}
