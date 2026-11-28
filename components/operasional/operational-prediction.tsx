"use client";
import {useState} from "react";
import {Badge,Button,Card,PageHeading} from "@/components/ui";
import {DateField} from "@/components/ui/fields";
import {API_MODE} from "@/lib/api/client";
import {dateInWib} from "@/lib/production-date";
import {useDemo} from "@/lib/demo";
import {ProductionDayApi} from "@/components/produksi/production-day-api";
export function OperationalPrediction({initialDate,embedded=false,selectedDate,onDateChange}:{initialDate:string;embedded?:boolean;selectedDate?:string;onDateChange?:(date:string)=>void}) {
  const [ownDate,setOwnDate]=useState(initialDate);const date=selectedDate??ownDate;const setDate=onDateChange??setOwnDate;const {role}=useDemo();
  return <div className="page-enter production-stack">
    {!embedded&&<PageHeading title="Status Pemenuhan" subtitle="Periksa prediksi target tiap batch (Terpenuhi, Berisiko, Tidak terpenuhi, Data belum cukup) dan lanjutkan ke rekomendasi saat diperlukan."/>}
    <Card className="production-date"><label className="schedule-form"><span className="field-label">Tanggal produksi (WIB)</span><DateField label="Tanggal status pemenuhan" value={date} onChange={setDate}/></label><Button variant="secondary" onClick={()=>setDate(dateInWib())}>Hari ini</Button><div style={{display:"flex",flexWrap:"wrap",gap:"8px",alignItems:"center"}} aria-label="Model status pemenuhan"><Badge tone="ok">Terpenuhi</Badge><Badge tone="warn">Berisiko</Badge><Badge tone="crit">Tidak terpenuhi</Badge><Badge tone="neutral">Data belum cukup</Badge></div></Card>
    {!API_MODE?<Card><p>Mode demo belum menyediakan status pemenuhan dari backend.</p></Card>:!date?<Card><p role="status">Pilih tanggal produksi untuk memeriksa status pemenuhan.</p></Card>:<ProductionDayApi key={date} date={date} role={role} display="status"/>}
  </div>;
}
