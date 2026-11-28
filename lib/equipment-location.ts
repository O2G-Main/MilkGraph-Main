export type EquipmentView = "catalog" | "status" | "settings" | "lines";
export function equipmentView(value:unknown):EquipmentView {
  return value === "status" || value === "settings" || value === "lines" ? value : "catalog";
}
export function equipmentLocation(tab:EquipmentView,asset?:string) {
  const p=new URLSearchParams({tab});if(asset)p.set("asset",asset);return `/alat?${p}`;
}
