export interface PlantAsset {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  capacity_l?: string;
  process_speed_lph?: string;
  input_flow_lph?: string;
  output_flow_lph?: string;
  speed_packph?: string;
  cip_duration_minutes?: string;
  holding_time_limit_hours?: string;
  compatible_product_family?: string;
}

export interface PlantConnection {
  connection_id: string;
  source_asset_id: string;
  destination_asset_id: string;
  via_asset_id: string;
  flow_type: string;
  max_flow_lph: string;
}

export interface PlantTopologyData {
  nodes: PlantAsset[];
  edges: PlantConnection[];
}

const stages: Record<string, number> = {
  "Farm Supply Boundary": 0,
  "Road Tanker Delivery Boundary": 1,
  "Unloading Bay": 2,
  "Raw Milk Tank": 3,
  "Thermizer": 4,
  "Separation / Standardization": 5,
  "Degassing": 5,
  "Cream Tank": 5,
  "Premix Tank": 5,
  "Mixing Tank": 6,
  "SFP Storage Tank": 6,
  "Sterilizer": 7,
  "Aseptic Tank": 8,
  "Filling Line": 9,
  "Finished Goods Batch Boundary": 10,
};

/** Positions affect presentation only; connection direction and identifiers remain server-owned. */
export function plantGraph(topology: PlantTopologyData) {
  const rows = new Map<number, number>();
  const ids = new Set(topology.nodes.map(asset => asset.asset_id));
  const nodes = topology.nodes.map(asset => {
    const column = stages[asset.asset_type] ?? 6;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { id: asset.asset_id, asset, position: { x: column * 270, y: row * 125 } };
  });
  const missing = topology.edges.filter(edge => !ids.has(edge.source_asset_id) || !ids.has(edge.destination_asset_id));
  return {
    nodes,
    edges: topology.edges.filter(edge => ids.has(edge.source_asset_id) && ids.has(edge.destination_asset_id)),
    missing,
  };
}

export function connectedRoutes(topology: PlantTopologyData, assetId: string) {
  return topology.edges.filter(edge => edge.source_asset_id === assetId || edge.destination_asset_id === assetId || edge.via_asset_id === assetId);
}

export function filterPlantTopology(topology: PlantTopologyData, search: string, type: string) {
  const query = search.trim().toLowerCase();
  const eligible = new Set(topology.nodes.filter(asset => !type || asset.asset_type === type).map(asset => asset.asset_id));
  const visible = new Set(topology.nodes.filter(asset => eligible.has(asset.asset_id) && (!query || `${asset.asset_id} ${asset.asset_name} ${asset.asset_type}`.toLowerCase().includes(query))).map(asset => asset.asset_id));
  const matchingAssets = new Set(visible);
  const routes = topology.edges.filter(edge => {
    if (type && !eligible.has(edge.source_asset_id) && !eligible.has(edge.destination_asset_id)) return false;
    const routeMatch = !!query && `${edge.connection_id} ${edge.via_asset_id} ${edge.flow_type}`.toLowerCase().includes(query);
    const matched = !query || matchingAssets.has(edge.source_asset_id) || matchingAssets.has(edge.destination_asset_id) || routeMatch;
    if (matched && routeMatch) {
      if (eligible.has(edge.source_asset_id)) visible.add(edge.source_asset_id);
      if (eligible.has(edge.destination_asset_id)) visible.add(edge.destination_asset_id);
    }
    return matched;
  });
  return { visible, routes };
}
