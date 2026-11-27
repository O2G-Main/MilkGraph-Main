"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const PlanningContext = createContext<{
  date: string; batch: string;
  chooseDate: (date: string) => void; chooseBatch: (batch: string) => void;
} | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState("");
  const [batch, setBatch] = useState("");
  return <PlanningContext.Provider value={{ date, batch,
    chooseDate: value => { setDate(value); setBatch(""); }, chooseBatch: setBatch,
  }}>{children}</PlanningContext.Provider>;
}

export function usePlanningSelection() {
  const value = useContext(PlanningContext);
  if (!value) throw new Error("PlanningProvider belum terpasang.");
  return value;
}
