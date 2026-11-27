import { connection } from "next/server";
import { ProductionPage } from "@/components/produksi/production-page";
import { dateInWib } from "@/lib/production-date";
import { validProductionDate } from "@/lib/factory-monitor";
import { productionTab } from "@/lib/production-location";
export const metadata = { title: "Produksi | MilkGraph" };
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string;date?:string;batch?:string}>}) {
  await connection();const params=await searchParams;
  const date=validProductionDate(params.date)?params.date:dateInWib();
  const batch=typeof params.batch==="string"?params.batch:"";
  const tab=productionTab(params.tab);
  return <ProductionPage key={`${date}:${batch}:${tab}`} initialDate={date} initialBatch={batch} initialTab={tab} invalidDate={params.date!==undefined&&!validProductionDate(params.date)}/>;
}
