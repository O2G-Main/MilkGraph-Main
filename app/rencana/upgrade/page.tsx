import { RencanaUpgrade } from "@/components/rencana/plan-pages";
import { validProductionDate } from "@/lib/factory-monitor";
export default async function Page({searchParams}:{searchParams:Promise<{date?:string;batch?:string;prediction?:string}>}) {
  const p=await searchParams;
  const initial=validProductionDate(p.date)?{date:p.date,batch:typeof p.batch==="string"?p.batch:"",prediction:typeof p.prediction==="string"&&/^\d+$/.test(p.prediction)&&Number.isSafeInteger(Number(p.prediction))&&Number(p.prediction)>0?Number(p.prediction):undefined}:undefined;
  return <RencanaUpgrade key={JSON.stringify(initial)} initial={initial}/>;
}
