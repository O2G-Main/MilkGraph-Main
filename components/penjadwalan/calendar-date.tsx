"use client";

import type { ComponentProps } from "react";
import { useDayCondition } from "./use-day-condition";
import { ConditionIndicator } from "./condition-indicator";
import styles from "./scheduling.module.css";

export function CalendarDate({ date, ...props }: ComponentProps<"button"> & { date: string }) {
  const { condition } = useDayCondition(date);
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return <button {...props} data-date={date} data-condition={condition.kind}
    aria-label={`${label} · ${condition.label}`} title={`${condition.label}: ${condition.reasons.join(" ")}`}>
    <span>{new Date(`${date}T00:00:00Z`).getUTCDate()}</span>
    <span className={styles.conditionMarker}><ConditionIndicator kind={condition.kind} /></span>
  </button>;
}
