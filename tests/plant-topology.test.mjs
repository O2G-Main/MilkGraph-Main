import { test } from "node:test";
import assert from "node:assert/strict";
import { plantGraph, connectedRoutes, filterPlantTopology } from "../lib/api/topology.ts";
import { apiSend } from "../lib/api/client.ts";

const topology = {
  nodes: [
    { asset_id: "RMT-01", asset_name: "Raw tank", asset_type: "Raw Milk Tank", capacity_l: "N/A" },
    { asset_id: "1-Sep", asset_name: "Separator", asset_type: "Separation / Standardization", process_speed_lph: "X" },
  ],
  edges: [
    { connection_id: "GCON-001", source_asset_id: "RMT-01", destination_asset_id: "1-Sep", via_asset_id: "PIPE-01", flow_type: "main_milk", max_flow_lph: "X" },
    { connection_id: "GCON-MISSING", source_asset_id: "UNKNOWN", destination_asset_id: "RMT-01", via_asset_id: "", flow_type: "main_milk", max_flow_lph: "N/A" },
  ],
};

test("topologi mempertahankan ID dan placeholder Greenfields tanpa memperbaiki token", () => {
  const graph = plantGraph(topology);
  assert.deepEqual(graph.nodes.map(node => node.id), ["RMT-01", "1-Sep"]);
  assert.equal(graph.nodes[0].asset.capacity_l, "N/A");
  assert.equal(graph.nodes[1].asset.process_speed_lph, "X");
  assert.deepEqual(graph.edges, [topology.edges[0]]);
  assert.deepEqual(graph.missing, [topology.edges[1]]);
  assert.equal(graph.edges[0].via_asset_id, "PIPE-01");
});

test("rute terkait mengikuti asal, tujuan, dan pipa perantara", () => {
  assert.equal(connectedRoutes(topology, "RMT-01").length, 2);
  assert.deepEqual(connectedRoutes(topology, "PIPE-01"), [topology.edges[0]]);
  assert.deepEqual(connectedRoutes(topology, "FL-NOT-FOUND"), []);
});

test("topologi kosong menghasilkan diagram kosong, bukan fixture", () => {
  assert.deepEqual(plantGraph({ nodes: [], edges: [] }), { nodes: [], edges: [], missing: [] });
});

test("pencarian rute atau pipa menampilkan endpoint asli pada diagram dan daftar", () => {
  for (const query of ["GCON-001", "PIPE-01"]) {
    const filtered = filterPlantTopology(topology, query, "");
    assert.deepEqual([...filtered.visible].sort(), ["1-Sep", "RMT-01"]);
    assert.deepEqual(filtered.routes, [topology.edges[0]]);
  }
  assert.equal(filterPlantTopology(topology, "not-found", "").visible.size, 0);
  assert.deepEqual([...filterPlantTopology(topology, "PIPE-01", "Raw Milk Tank").visible], ["RMT-01"]);
});

test("client mengirim PATCH rekomendasi dan mempertahankan detail error backend", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify({ error: { code: "VALIDATION", field: "status", message: "Status tidak valid" } }), { status: 422 });
  };
  try {
    await assert.rejects(apiSend("PATCH", "/production/recommendations/7", { status: "accepted" }, "planner", "https://api.example.test"), error => error.status === 422 && error.code === "VALIDATION" && error.field === "status");
    assert.equal(calls[0].url, "https://api.example.test/api/v1/production/recommendations/7");
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].headers["X-Demo-Role"], "planner");
    assert.deepEqual(JSON.parse(calls[0].body), { status: "accepted" });
  } finally { globalThis.fetch = original; }
});
