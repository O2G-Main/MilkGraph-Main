"use client";
import {useState} from "react";
import {Button,Card,PageHeading} from "@/components/ui";
import {DateField} from "@/components/ui/fields";
import {API_MODE} from "@/lib/api/client";
import {dateInWib} from "@/lib/production-date";
import {useDemo} from "@/lib/demo";
import {ProductionDayApi} from "@/components/produksi/production-day-api";
export function OperationalPrediction({initialDate,embedded=false,selectedDate,onDateChange}:{initialDate:string;embedded?:boolean;selectedDate?:string;onDateChange?:(date:string)=>void}) {
  const [ownDate,setOwnDate]=useState(initialDate);const date=selectedDate??ownDate;const setDate=onDateChange??setOwnDate;const {role}=useDemo();
  return <div className="page-enter production-stack">
    {!embedded&&<PageHeading title="Status Pemenuhan" subtitle="Periksa prediksi target tiap batch dan lanjutkan ke rekomendasi saat diperlukan."/>}
    <Card className="production-date"><label className="schedule-form"><span className="field-label">Tanggal produksi (WIB)</span><DateField label="Tanggal status pemenuhan" value={date} onChange={setDate}/></label><Button variant="secondary" onClick={()=>setDate(dateInWib())}>Hari ini</Button></Card>
    {!API_MODE?<Card><p>Mode demo belum menyediakan status pemenuhan dari backend.</p></Card>:!date?<Card><p role="status">Pilih tanggal produksi untuk memeriksa status pemenuhan.</p></Card>:<ProductionDayApi key={date} date={date} role={role} display="status"/>}
  </div>;
}
