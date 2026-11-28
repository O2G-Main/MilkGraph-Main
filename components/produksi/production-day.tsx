"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card, Icon, SectionTitle, Table } from "@/components/ui";
import { useDemo } from "@/lib/demo";
import { SCENARIO_DATE } from "@/lib/flows";
import { number } from "@/lib/format";
import { canSee, type RoleId } from "@/lib/roles";
import { OUTPUTS } from "@/mock/outputs";

export function DemoProductionDay({ date, role }: { date: string; role: RoleId }) {
  const { schedule } = useDemo();
  const runs = date === SCENARIO_DATE ? schedule : [];
  const outputs = OUTPUTS.filter(output => output.date === date);

  return <>
    <Card>
      <SectionTitle title="Jadwal produksi" subtitle="Order simulasi sesuai tanggal snapshot."
        action={canSee(role, "/penjadwalan") && <Link href="/penjadwalan" className="text-link">Kelola jadwal<Icon icon={ArrowRight} size={14} /></Link>} />
      {runs.length ? <Table variant="schedule">
        <thead><tr><th>Produk</th><th>Lini</th><th>Mulai – selesai</th><th className="numeric">Target</th></tr></thead>
        <tbody>{runs.map(run => <tr key={run.id}><td>{run.sku}</td><td>{run.line}</td><td>{run.start} – {run.end}</td>
          <td className="numeric">{number(run.packs)} pak</td></tr>)}</tbody>
      </Table> : <p className="muted">Tidak ada order simulasi untuk tanggal ini.</p>}
    </Card>
    <Card>
      <SectionTitle title="Hasil produksi" subtitle="Output simulasi yang selesai pada tanggal terpilih."
        action={canSee(role, "/riwayat-produksi") && <Link href="/riwayat-produksi" className="text-link">Buka riwayat<Icon icon={ArrowRight} size={14} /></Link>} />
      {outputs.length ? <Table variant="schedule">
        <thead><tr><th>Produk / Lot</th><th>Selesai</th><th>Lini</th><th className="numeric">Jumlah</th></tr></thead>
        <tbody>{outputs.map(output => <tr key={output.id}>
          <td><strong>{output.product}</strong><span className="table-sub">{output.id}</span></td>
          <td>{output.end ?? "Belum tercatat"}</td><td>{output.line}</td><td className="numeric">{number(output.packs)} pak</td>
        </tr>)}</tbody>
      </Table> : <p className="muted">Tidak ada hasil simulasi untuk tanggal ini.</p>}
    </Card>
    <div><Badge>Data simulasi</Badge></div>
  </>;
}
