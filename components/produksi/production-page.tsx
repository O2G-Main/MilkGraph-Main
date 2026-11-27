"use client";

import { useState } from "react";
import { Alur } from "@/components/alur/alur";
import { Card, PageHeading, Toggle } from "@/components/ui";
import { API_MODE } from "@/lib/api/client";
import { useDemo } from "@/lib/demo";
import { dateInWib } from "@/lib/production-date";
import { DemoProductionDay } from "./production-day";
import { ProductionDayApi } from "./production-day-api";
import { ProductionCatalog } from "./production-catalog";
import { ProductionSettings } from "./production-settings";

type View = "daily" | "settings" | "catalog" | "flow";

export function ProductionPage({ initialDate }: { initialDate: string }) {
  const { role } = useDemo();
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<View>("daily");
  return <div className="page-enter">
    <PageHeading title="Produksi" subtitle="Pantau jadwal dan hasil harian, kelola pengaturan produksi, dan lihat alur pabrik." />
    <div className="page-tabs production-tabs">
      <Toggle label="Bagian Produksi" value={view} onChange={setView} options={[
        { value: "daily", label: "Produksi harian" },
        { value: "settings", label: "Pengaturan" },
        ...(API_MODE ? [{ value: "catalog" as const, label: "Aset dan produk" }] : []),
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
        {!date ? <p className="muted">Pilih tanggal untuk melihat produksi.</p>
          : API_MODE ? <ProductionDayApi key={date} date={date} role={role} />
          : <DemoProductionDay date={date} role={role} />}
      </>}
      {view === "settings" && <ProductionSettings role={role} />}
      {view === "catalog" && API_MODE && <ProductionCatalog role={role} />}
      {view === "flow" && <Alur />}
    </div>
  </div>;
}
