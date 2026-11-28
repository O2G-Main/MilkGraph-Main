import { EquipmentPage } from "@/components/alat/equipment-page";
import { redirect } from "next/navigation";
import { equipmentLocation, equipmentView } from "@/lib/equipment-location";
export const metadata = { title: "Alat | MilkGraph" };
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string;asset?:string;alat?:string}>}) {
  const p=await searchParams;
  if (!p.tab && typeof p.alat==="string") redirect(equipmentLocation("status",p.alat));
  const tab=equipmentView(p.tab);const asset=typeof p.asset==="string"?p.asset:"";
  return <EquipmentPage key={`${tab}:${asset}`} initialView={tab} initialAsset={asset}/>;
}
