"use client";

import { Check, Circle, Clock3, HelpCircle, LoaderCircle, Minus, TriangleAlert, XCircle } from "lucide-react";
import { Icon } from "@/components/ui";
import type { DayConditionKind } from "@/lib/production-condition";

const icons = { complete: Check, scheduled: Clock3, risk: TriangleAlert, action: XCircle, empty: Minus, unknown: HelpCircle, loading: LoaderCircle, error: Circle };
export function ConditionIndicator({ kind }: { kind: DayConditionKind }) {
  return <Icon icon={icons[kind]} size={12} />;
}
