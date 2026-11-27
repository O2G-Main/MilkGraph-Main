"use client";

import { useState } from "react";
import { Alur } from "@/components/alur/alur";
import { Card, PageHeading, Toggle } from "@/components/ui";
import { useDemo } from "@/lib/demo";
import { dateInWib } from "@/lib/production-date";
import { ProductionDay } from "./production-day";
import { ProductionSettings } from "./production-settings";

type View = "daily" | "settings" | "flow";

export function ProductionPage({ initialDate }: { initialDate: string }) {
  const { role } = useDemo();
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<View>("daily");
  return <div className="page-enter">
    <PageHeading title="Produksi" subtitle="Pantau jadwal dan hasil harian, kelola pengaturan produksi, dan lihat alur pabrik." />
    <div className="page-tabs">
      <Toggle label="Bagian Produksi" value={view} onChange={setView} options={[
        { value: "daily", label: "Produksi harian" },
        { value: "settings", label: "Pengaturan" },
        { value: "flow", label: "Alur pabrik" },
      ]} />
    </div>
    <div className="production-stack">
      {view === "daily" && <>
        <Card className="production-date">
          <label className="schedule-form">
            <span className="field-label">Tanggal produksi (WIB)</span>
            <input type="date" value={date} onChange={e => setDate(e.currentTarget.value)} />
          </label>
          <button className="button secondary" onClick={() => setDate(dateInWib())}>Hari ini</button>
        </Card>
        {date ? <ProductionDay date={date} role={role} /> : <p className="muted">Pilih tanggal untuk melihat produksi.</p>}
      </>}
      {view === "settings" && <ProductionSettings role={role} />}
      {view === "flow" && <Alur />}
    </div>
  </div>;
}
