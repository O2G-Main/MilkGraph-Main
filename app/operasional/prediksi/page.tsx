import { connection } from "next/server";
import { OperationalPrediction } from "@/components/operasional/operational-prediction";
import { validProductionDate } from "@/lib/factory-monitor";
import { dateInWib } from "@/lib/production-date";
export const metadata={title:"Status Pemenuhan | MilkGraph"};
export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}) {
  await connection();const params=await searchParams;
  const date=validProductionDate(params.date)?params.date:dateInWib();
  return <OperationalPrediction key={date} initialDate={date}/>;
}
