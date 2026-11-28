import { redirect } from "next/navigation";
import { productionLocation } from "@/lib/production-location";
export default async function Page({searchParams}:{searchParams:Promise<{date?:string;batch?:string}>}) {
  const p=await searchParams;
  redirect(productionLocation("kondisi",typeof p.date==="string"?p.date:undefined,typeof p.batch==="string"?p.batch:undefined));
}
