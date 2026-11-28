"use client";

import { useState } from "react";
import { PageHeading, Toggle } from "@/components/ui";
import { useDemo } from "@/lib/demo";
import { productionLocation, type ProductionTab } from "@/lib/production-location";
import { FactoryMonitor } from "@/components/kondisi-pabrik/factory-monitor";
import { OperationalPrediction } from "@/components/operasional/operational-prediction";
import { ProcessManagement } from "./process-management";

export function ProductionPage({ initialDate, initialBatch="", initialTab="kondisi", invalidDate=false }: {
  initialDate:string;initialBatch?:string;initialTab?:ProductionTab;invalidDate?:boolean;
}) {
  const {role}=useDemo();
  const [date,setDate]=useState(initialDate);
  const [batch,setBatch]=useState(initialBatch);
  const [view,setView]=useState<ProductionTab>(initialTab);
  const updateUrl=(tab:ProductionTab,nextDate:string,nextBatch:string)=>window.history.replaceState(null,"",productionLocation(tab,nextDate,nextBatch));
  const changeDate=(value:string)=>{setDate(value);setBatch("");updateUrl(view,value,"");};
  const changeBatch=(value:string)=>{setBatch(value);updateUrl(view,date,value);};
  const changeView=(value:ProductionTab)=>{setView(value);updateUrl(value,date,batch);};
  return <div className="page-enter">
    <PageHeading title="Produksi" subtitle="Pantau kondisi pabrik, kelola konfigurasi proses, dan periksa prediksi pemenuhan produksi."/>
    <div className="page-tabs production-tabs"><Toggle label="Bagian Produksi" value={view} onChange={changeView} options={[
      {value:"kondisi",label:"Kondisi pabrik"},{value:"proses",label:"Manajemen proses"},{value:"prediksi",label:"Prediksi pemenuhan"},
    ]}/></div>
    <div className="production-stack">
      {view==="kondisi"&&<FactoryMonitor embedded initialDate={initialDate} initialBatch={initialBatch} invalidDate={invalidDate} selectedDate={date} selectedBatch={batch} onDateChange={changeDate} onBatchChange={changeBatch}/>}
      {view==="proses"&&<ProcessManagement role={role}/>}
      {view==="prediksi"&&<OperationalPrediction embedded initialDate={initialDate} selectedDate={date} onDateChange={changeDate}/>}
    </div>
  </div>;
}
