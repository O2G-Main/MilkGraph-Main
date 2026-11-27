import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { classifyChangeover, getMasterRules, parseMasterRules, validateChangeoverPair } from "../lib/api/catalog.ts";

// Local mock server fixtures, not live classification results.
const master = {
  changeoverRules: [{ rule_id: "VARIANT", activity: "Variant Changeover", condition: "Flavour_variant_changes", duration_minutes: "45", precedence: "FIRST", additional_note: "CIP independen" }],
  cipRules: [{ rule_id: "CIP_EMPTY", trigger: "End_Storage_Volume", asset_scope: "Tank", requirement: "CIP sebelum refill" }],
  constraintCatalog: [{ rule_id: "CAPACITY", scope: "tank", description: "Inventory tidak negatif" }],
  assetUnits: [{ field: "speed_packph", unit: "packs/hour", applies_to: "Filling Line", definition: "Machine pack rate" }],
};
const normalized = { changeover: master.changeoverRules, cip: master.cipRules, constraints: master.constraintCatalog, asset_units: master.assetUnits };
const catalog = { products: [], pack_size_codes: [], product_pack_sizes: [], product_market_variants: [], finished_skus: ["A", "B"].map(id => ({ finished_sku_id: id, liquid_sku_id: "LIQUID", pack_size_code: "SIZE", market_variant: "LOCAL" })) };
const result = { ruleId: "VARIANT", activity: "Variant Changeover", precedence: "FIRST", condition: "Flavour_variant_changes", requiresCip: true, cipRuleId: "CIP_FLAVOUR", cipRequirement: "CIP selesai sebelum produksi", additionalNote: "CIP independen" };
async function withMock(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("master rules normalizes actual camelCase CSV collections and normalized aliases", () => {
  assert.deepEqual(parseMasterRules(master), normalized);
  assert.deepEqual(parseMasterRules(normalized), normalized);
  assert.equal(parseMasterRules(master).changeover[0].duration_minutes, "45");
});

test("master rules GET reads all four collections with role (local mock)", async () => {
  const calls = [];
  await withMock((req, res) => {
    calls.push([req.method, req.url, req.headers["x-demo-role"]]);
    res.end(JSON.stringify(master));
  }, async base => assert.deepEqual(await getMasterRules("planner", base), normalized));
  assert.deepEqual(calls, [["GET", "/api/v1/master/rules", "planner"]]);
});

test("empty master lists stay empty, malformed master does not become mock rules", () => {
  const empty = { changeover: [], cip: [], constraints: [], asset_units: [] };
  assert.deepEqual(parseMasterRules(empty), empty);
  assert.throws(() => parseMasterRules({}), /tidak valid/);
  assert.throws(() => parseMasterRules({ ...master, changeoverRules: [{ ...master.changeoverRules[0], duration_minutes: null }] }), /tidak valid/);
});

test("pair validation rejects empty or unknown IDs and allows same SKU", () => {
  assert.match(validateChangeoverPair(catalog, "", "B"), /Pilih/);
  assert.match(validateChangeoverPair(catalog, "unknown", "B"), /katalog/);
  assert.equal(validateChangeoverPair(catalog, "A", "A"), null);
});

test("invalid selection cannot issue a request", async () => {
  let calls = 0;
  await withMock((_req, res) => { calls++; res.end("{}"); }, async base => {
    await assert.rejects(classifyChangeover(catalog, "", "B", "planner", base), /Pilih/);
    await assert.rejects(classifyChangeover(catalog, " A ", "B", "planner", base), /katalog/);
  });
  assert.equal(calls, 0);
});

test("classifier POST sends exact finished SKU IDs and role, returns backend CIP result (local mock)", async () => {
  const calls = [];
  await withMock(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push([req.method, req.url, req.headers["x-demo-role"], req.headers["content-type"], JSON.parse(body)]);
    res.end(JSON.stringify(result));
  }, async base => assert.deepEqual(await classifyChangeover(catalog, "A", "B", "qa", base), result));
  assert.deepEqual(calls, [["POST", "/api/v1/master/changeover/classify", "qa", "application/json", { from: "A", to: "B" }]]);
});

test("classifier retains server validation failures without fabricated success", async () => {
  await withMock((_req, res) => {
    res.writeHead(422, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "INVALID_SKU", field: "to", message: "SKU tidak aktif" } }));
  }, async base => assert.rejects(classifyChangeover(catalog, "A", "B", "planner", base), error => error.status === 422 && error.field === "to" && error.message === "SKU tidak aktif"));
});

test("master server failure is not replaced by demo defaults", async () => {
  await withMock((_req, res) => { res.writeHead(503); res.end("{}"); }, async base => assert.rejects(getMasterRules("planner", base), error => error.status === 503));
});

test("malformed classifier result rejects and false CIP remains false", async () => {
  await withMock((_req, res) => { res.end(JSON.stringify({ ...result, requiresCip: "false" })); }, async base => assert.rejects(classifyChangeover(catalog, "A", "B", "planner", base), /tidak valid/));
  await withMock((_req, res) => { res.end(JSON.stringify({ ...result, requiresCip: false })); }, async base => assert.equal((await classifyChangeover(catalog, "A", "A", "planner", base)).requiresCip, false));
});
