"use client";

import { useResource } from "@/lib/api/resource";
import type { ProductionList, ProductionScheduleRow } from "@/lib/api/production";
import { productionWeek } from "@/lib/scheduling";

function useDay(date: string) {
  return useResource<ProductionList<ProductionScheduleRow>>(`/production/schedule?date=${date}`);
}

export function useWeekSchedule(date: string) {
  const days = productionWeek(date);
  const first = useDay(days[0]);
  const second = useDay(days[1]);
  const third = useDay(days[2]);
  const fourth = useDay(days[3]);
  const fifth = useDay(days[4]);
  const sixth = useDay(days[5]);
  const seventh = useDay(days[6]);
  return { days, resources: [first, second, third, fourth, fifth, sixth, seventh] };
}
