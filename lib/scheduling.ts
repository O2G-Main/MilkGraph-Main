import type { WeeklyPlan } from "./api/planning.ts";
import type { ProductionScheduleRow } from "./api/production.ts";

export function moveDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Production plans identify their weeks by Sunday. */
export function productionWeek(date: string): string[] {
  const start = moveDate(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, index) => moveDate(start, index));
}

export function weeklyTargets(rows: WeeklyPlan[]) {
  const proposals = new Map<string, WeeklyPlan[]>();
  for (const row of rows) proposals.set(row.proposal_id, [...(proposals.get(row.proposal_id) ?? []), row]);
  const targets = [...proposals.values()];
  const sum = (groups: WeeklyPlan[][]) => groups.some(group => group[0].target_volume_l === null)
    ? null : groups.reduce((total, group) => total + (group[0].target_volume_l ?? 0), 0);
  return {
    target: sum(targets),
    unlinked: sum(targets.filter(group => group.every(row => !row.batch_id))),
    proposals: targets.map(group => group[0]),
  };
}

export function uniqueSchedule(rows: ProductionScheduleRow[]): ProductionScheduleRow[] {
  return [...new Map(rows.map(row => [
    JSON.stringify([row.production_date, row.batch_id, row.line_no, row.production_order_id, row.finished_sku_id]), row,
  ])).values()].sort((a, b) => a.sequence_no - b.sequence_no || (a.line_no ?? 0) - (b.line_no ?? 0));
}

export function scheduledVolume(rows: ProductionScheduleRow[]): number | null {
  const unique = uniqueSchedule(rows);
  return unique.some(row => row.target_volume_l === null) ? null
    : unique.reduce((sum, row) => sum + (row.target_volume_l ?? 0), 0);
}
