export type ProductionTraceEvent = {
  trace_source: string; transaction_id: string | null; machine_id: string | null; activity: string | null;
  start_time: string | null; end_time: string | null; volume_l: number | null; output_good_packs: number | null;
  output_volume_l: number | null; source_asset_id: string | null; destination_asset_id: string | null; downtime_type: string | null;
};
export type ProductionTrace = { batch_id: string; batch_code: string; production_date: string; production_group_id: string | null; events: ProductionTraceEvent[]; incomplete_sections: string[] };
export function traceMillis(value: string | null | undefined): number | null {
  if (!value || !/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const n = Date.parse(value); return Number.isFinite(n) ? n : null;
}
export function traceTimestamp(value: string | null | undefined): string {
  const n = traceMillis(value); if (n === null) return "Waktu belum tercatat";
  return `${new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(n)} WIB`;
}
export function traceDuration(event: Pick<ProductionTraceEvent,"start_time"|"end_time">): string {
  const start = traceMillis(event.start_time), end = traceMillis(event.end_time);
  if(start === null || end === null) return "Durasi belum dapat dihitung";
  if(end < start) return "Waktu selesai mendahului mulai";
  let seconds = Math.floor((end-start)/1000);
  if(!seconds) return "0 detik (kejadian sesaat)";
  const hours = Math.floor(seconds/3600); seconds %= 3600;
  const minutes = Math.floor(seconds/60); seconds %= 60;
  return [hours?`${hours} jam`:"",minutes?`${minutes} menit`:"",seconds?`${seconds} detik`:""].filter(Boolean).join(" ");
}
/** The group join can return identical transactions once for every related batch.
 * Deduplicate only exact event payloads, never just an ID with differing details. */
export function distinctTraceEvents(events: ProductionTraceEvent[]): ProductionTraceEvent[] {
  const seen = new Set<string>();
  return events.filter(event => {
    const key=JSON.stringify([event.trace_source,event.transaction_id,event.machine_id,event.activity,event.start_time,event.end_time,event.volume_l,event.output_good_packs,event.output_volume_l,event.source_asset_id,event.destination_asset_id,event.downtime_type]);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function orderTraceEvents(events: ProductionTraceEvent[], backward = false) {
  return [...events].sort((a,b) => {
    const startA=traceMillis(a.start_time),startB=traceMillis(b.start_time);
    if(startA===null&&startB!==null)return 1;if(startB===null&&startA!==null)return -1;
    return ((startA??0)-(startB??0))*(backward?-1:1) || (a.transaction_id??"").localeCompare(b.transaction_id??"");
  });
}
export function traceAssetIds(event: ProductionTraceEvent) {
  return [...new Set([event.machine_id,event.source_asset_id,event.destination_asset_id].flatMap(value=>(value??"").split(";").map(id=>id.trim()).filter(Boolean)))];
}
