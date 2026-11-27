"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Equipment } from "@/components/trace/equipment";

export type PlantNode = Node<{ id: string; kind: string; status: string; selected: boolean; focused: boolean; onPick: (id: string) => void }, "plant-asset">;
export function PlantAssetNode({ data }: NodeProps<PlantNode>) {
  return <>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <button type="button" className={`flow-node ${data.selected || data.focused ? "is-selected" : ""}`} aria-label={`Lihat alat ${data.id}`} aria-pressed={data.selected} onClick={() => data.onPick(data.id)}>
      <Equipment kind={data.kind} size={48} />
      <strong>{data.id}</strong>
      <span className="mini-status neutral">{data.status}</span>
    </button>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </>;
}
export function equipmentKind(type: string): string {
  const types: Record<string, string> = { "Unloading Bay": "Bay", "Raw Milk Tank": "Buffer", "Thermizer": "Thermal", "Separator": "Separator", "Separation / Standardization": "Separator", "Transfer Tank": "Storage", "SFP Storage Tank": "Storage", "Finished Goods Batch Boundary": "Lot", "Cream Tank": "Cream", "Premix Tank": "Premix", "Mixing Tank": "Mixing", "Sterilizer": "Sterilisasi", "Aseptic Tank": "Aseptic", "Filling Machine": "Filling", "Filling Line": "Filling", "Farm Supply Boundary": "Farm", "Road Tanker Delivery Boundary": "RT" };
  return types[type] || type;
}

export function equipmentStage(type: string): string {
  const stages: Record<string, string> = { Farm: "Penerimaan", RT: "Penerimaan", Bay: "Penerimaan", Buffer: "Susu mentah", Thermal: "Susu mentah", Separator: "Susu mentah", Storage: "Penyimpanan", Cream: "Penyimpanan", Premix: "Penyimpanan", Mixing: "Mixing", Sterilisasi: "Sterilisasi", Aseptic: "Tangki aseptik", Filling: "Filling", Lot: "Barang jadi" };
  return stages[equipmentKind(type)] || type;
}
