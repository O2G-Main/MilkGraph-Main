import type { ProductionRecommendation } from "./api/planning.ts";
export function recommendationOrigin(row: Pick<ProductionRecommendation,"reason_facts">) {
  const source=row.reason_facts?.sumber_pilihan;
  if(source==="jev")return {label:"Dipilih AI",tone:"ok" as const};
  if(source==="template")return {label:"Dipilih aturan BE",tone:"neutral" as const};
  return {label:"Sumber pilihan belum disertakan",tone:"neutral" as const};
}
export function recommendationLink(date:string,batch:string|null,prediction:number) {
  const params=new URLSearchParams({date,prediction:String(prediction)});if(batch)params.set("batch",batch);
  return `/rencana/upgrade?${params}`;
}
