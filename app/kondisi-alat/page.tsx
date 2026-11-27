import { redirect } from "next/navigation";
import { equipmentLocation } from "@/lib/equipment-location";
export default async function Page({searchParams}:{searchParams:Promise<{asset?:string;alat?:string}>}) {
  const p=await searchParams;const asset=typeof p.asset==="string"?p.asset:typeof p.alat==="string"?p.alat:undefined;
  redirect(equipmentLocation("status",asset));
}
