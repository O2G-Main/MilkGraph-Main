"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Modal, SectionTitle, Table, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { AssetConfigurationPanel } from "@/components/produksi/asset-configuration-editor";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { equipmentSpecs, type EquipmentMaster } from "@/lib/api/equipment";
import { useDemo } from "@/lib/demo";
import { displayText } from "@/lib/display-text";
import { assetStatusTone } from "@/lib/factory-monitor";

type GreenfieldAsset = EquipmentMaster & {asset_name:string;asset_type:string};
const value=(v:unknown)=>v===null||v===undefined||v===""?"Belum tersedia":displayText(String(v));
const assetLocation=(row:GreenfieldAsset)=>row.area||row.line_id||row.location?String(row.area||row.line_id||row.location):null;
const assetStatus=(row:GreenfieldAsset)=>row.operational_status||row.clean_status?String(row.operational_status||row.clean_status):null;

export function GreenfieldCatalog({onStatus}:{onStatus:(id:string)=>void}) {
  const { role } = useDemo();
  const master=useResource<GreenfieldAsset[]>(API_MODE?"/master/assets":null);
  const [search,setSearch]=useState("");const [type,setType]=useState("");const [picked,setPicked]=useState<string|null>(null);
  const [displayMode,setDisplayMode]=useState<"cards"|"table">("cards");
  const valid=Array.isArray(master.data)&&master.data.every(row=>row&&typeof row.asset_id==="string"&&typeof row.asset_name==="string"&&typeof row.asset_type==="string");
  const rows=valid?master.data!:[];
  const query=search.trim().toLowerCase();
  const shown=rows.filter(row=>(!type||row.asset_type===type)&&`${row.asset_id} ${row.asset_name} ${row.asset_type}`.toLowerCase().includes(query));
  const selected=rows.find(row=>row.asset_id===picked);
  const specs=selected?equipmentSpecs(selected.asset_id,rows):null;
  return <Card>
    <SectionTitle title="Katalog alat Greenfields" subtitle="Daftar alat, tangki, lini, dan titik konfigurasi bawaan dari master Greenfields di backend. Nilai mengikuti konfigurasi terakhir yang tersimpan."
      action={<Button variant="secondary" disabled={master.loading} onClick={()=>void master.reload()}>Muat ulang katalog</Button>}/>
    {!API_MODE?<p className="muted">Katalog Greenfields memerlukan sumber data API. Data simulasi tidak ditampilkan sebagai master alat.</p>
    :master.error?<div role="alert"><p className="crit-text">Katalog Greenfields gagal dimuat: {master.error.message}</p><Button variant="secondary" onClick={()=>void master.reload()}>Coba lagi</Button></div>
    :!master.data?<p role="status" className="muted">Memuat katalog Greenfields…</p>
    :!valid?<p role="alert" className="crit-text">Format master alat dari backend belum dapat dibaca.</p>
    :<>
      <div className="schedule-form"><div className="schedule-form-row">
        <label><span className="field-label">Cari alat</span><Input type="search" aria-label="Cari katalog Greenfields" placeholder="Kode, nama, atau jenis alat" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <label><span className="field-label">Jenis alat</span><Select label="Jenis alat Greenfields" value={type} onChange={setType} options={[{value:"",label:"Semua jenis"},...[...new Set(rows.map(row=>row.asset_type))].sort().map(kind=>({value:kind,label:displayText(kind)}))]}/></label>
      </div></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px",marginBottom:"12px"}}>
        <p className="small muted" role="status" style={{margin:0}}>Menampilkan {shown.length} dari {rows.length} entri master. Kondisi operasional dan downtime dapat dilihat pada tab Status.</p>
        <Toggle label="Tampilan katalog alat" value={displayMode} onChange={setDisplayMode} options={[{value:"cards",label:"Kartu"},{value:"table",label:"Tabel"}]}/>
      </div>
      {!shown.length?<p className="muted">{rows.length?"Tidak ada alat yang cocok dengan pencarian atau jenis ini.":"Master alat Greenfields belum tersedia di backend."}</p>
      :displayMode==="cards"?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:"16px"}}>
        {shown.map(row=>{
          const status=assetStatus(row);
          const location=assetLocation(row);
          return <Card key={row.asset_id} variant="panel" style={{display:"grid",gap:"12px",alignContent:"space-between"}}>
            <div style={{display:"grid",gap:"8px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"8px",flexWrap:"wrap"}}>
                <div><strong className="mono">{row.asset_id}</strong><div style={{fontWeight:500,marginTop:"2px"}}>{row.asset_name}</div></div>
                <Badge tone={status?assetStatusTone(status):"neutral"}>{status?displayText(status):"Master Greenfields"}</Badge>
              </div>
              <div className="small muted">{displayText(row.asset_type)}{location?` · ${displayText(location)}`:""}</div>
              <div className="small muted" style={{display:"flex",flexWrap:"wrap",gap:"6px 14px"}}>
                <span>Kapasitas: {value(row.capacity_l)}</span>
                <span>Proses: {value(row.process_speed_lph)}</span>
              </div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
              <Button variant="secondary" aria-label={`Spesifikasi ${row.asset_id}`} onClick={()=>setPicked(row.asset_id)}>Spesifikasi &amp; atur</Button>
              <Button variant="text" aria-label={`Lihat status ${row.asset_id}`} onClick={()=>onStatus(row.asset_id)}>Lihat status</Button>
            </div>
          </Card>;
        })}
      </div>
      :<Table variant="asset">
        <thead><tr><th>Alat</th><th>Jenis</th><th>Kapasitas (L)</th><th>Proses (L/jam)</th><th>Kemasan (pak/jam)</th><th>Aksi</th></tr></thead>
        <tbody>{shown.map(row=><tr key={row.asset_id}>
          <td><strong className="mono">{row.asset_id}</strong><span className="table-sub">{row.asset_name}</span></td>
          <td data-label="Jenis">{displayText(row.asset_type)}</td><td data-label="Kapasitas (L)">{value(row.capacity_l)}</td><td data-label="Proses (L/jam)">{value(row.process_speed_lph)}</td><td data-label="Kemasan (pak/jam)">{value(row.speed_packph)}</td>
          <td className="table-action queue-actions"><Button variant="secondary" aria-label={`Spesifikasi ${row.asset_id}`} onClick={()=>setPicked(row.asset_id)}>Spesifikasi</Button><Button variant="secondary" aria-label={`Lihat status ${row.asset_id}`} onClick={()=>onStatus(row.asset_id)}>Lihat status</Button></td>
        </tr>)}</tbody>
      </Table>}
    </>}
    {selected&&<Modal title={`Spesifikasi ${selected.asset_id}`} onClose={()=>setPicked(null)}>
      <p>{selected.asset_name} · {displayText(selected.asset_type)}</p><Badge>Master Greenfields</Badge>
      <Table variant="schedule"><tbody>{specs?.map(spec=><tr key={spec.key}><th scope="row">{spec.label}</th><td>{value(spec.value)}</td></tr>)}</tbody></Table>
      <p className="small muted">Spesifikasi master berbeda dengan catatan kondisi operasional alat. Parameter yang belum tersedia tidak dianggap nol.</p>
      {API_MODE?<AssetConfigurationPanel id={selected.asset_id} role={role}/>:<p className="small muted">Pengaturan parameter per alat memerlukan mode API aktif.</p>}
      <div className="dialog-actions"><Button variant="secondary" onClick={()=>setPicked(null)}>Tutup</Button><Button variant="primary" onClick={()=>onStatus(selected.asset_id)}>Lihat status alat</Button></div>
    </Modal>}
  </Card>;
}
