import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getProductCatalog, parseProductCatalog, filterProducts, productRelations } from "../lib/api/catalog.ts";

// Local contract fixtures only; these tests never contact production.
const catalog = {
  products: [
    { sku_id: "ESL-FC", product_name: "ESL Full Cream", product_family: "ESL", flavour: "Full Cream" },
    { sku_id: "UHT-CH", product_name: "UHT Chocolate", product_family: "UHT", flavour: "Chocolate" },
  ],
  pack_size_codes: [{ pack_size_code: "LARGE_A", description: "Besar", exact_size_ml: 1000 }],
  product_pack_sizes: [{ sku_id: "ESL-FC", pack_size_code: "LARGE_A" }],
  product_market_variants: [{ sku_id: "ESL-FC", market_variant: "LOCAL" }],
  finished_skus: [{ finished_sku_id: "ESL-FC-1000-LOCAL", liquid_sku_id: "ESL-FC", pack_size_code: "LARGE_A", market_variant: "LOCAL" }],
};
async function withMock(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("catalog GET uses normalized production endpoint and role (local mock)", async () => {
  const calls = [];
  await withMock((req, res) => {
    calls.push([req.method, req.url, req.headers["x-demo-role"]]);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(catalog));
  }, async base => assert.deepEqual(await getProductCatalog("qa", base), catalog));
  assert.deepEqual(calls, [["GET", "/api/v1/production/products", "qa"]]);
});

test("catalog searches product name, flavour, liquid SKU, and finished SKU", () => {
  for (const query of [" FULL cream ", "esl-fc", "esl-fc-1000-local"]) assert.deepEqual(filterProducts(catalog, query, "").map(row => row.sku_id), ["ESL-FC"]);
  assert.deepEqual(filterProducts(catalog, "chocolate", "").map(row => row.sku_id), ["UHT-CH"]);
});

test("catalog family filter combines with search without changing source", () => {
  assert.equal(filterProducts(catalog, "", "UHT").length, 1);
  assert.deepEqual(filterProducts(catalog, "Chocolate", "ESL"), []);
  assert.equal(catalog.products.length, 2);
});

test("product relations use IDs, not inferred SKU-name parsing", () => {
  assert.deepEqual(productRelations(catalog, "ESL-FC"), { packSizes: catalog.pack_size_codes, markets: ["LOCAL"], finishedSkus: catalog.finished_skus });
  assert.deepEqual(productRelations(catalog, "UHT-CH"), { packSizes: [], markets: [], finishedSkus: [] });
});

test("empty catalogue is valid; missing or malformed API lists are not fabricated", () => {
  const empty = Object.fromEntries(Object.keys(catalog).map(key => [key, []]));
  assert.deepEqual(parseProductCatalog(empty), empty);
  assert.throws(() => parseProductCatalog({}), /tidak valid/);
  assert.throws(() => parseProductCatalog({ ...catalog, products: [{ sku_id: "broken" }] }), /tidak valid/);
  assert.throws(() => parseProductCatalog({ ...catalog, pack_size_codes: [{ ...catalog.pack_size_codes[0], exact_size_ml: "1000" }] }), /tidak valid/);
});

test("catalog API failure preserves server error and never returns fallback data", async () => {
  await withMock((_req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "CATALOG_UNAVAILABLE", message: "Master unavailable" } }));
  }, async base => assert.rejects(getProductCatalog("planner", base), error => error.status === 503 && error.code === "CATALOG_UNAVAILABLE" && error.message === "Master unavailable"));
});

test("successful but malformed catalogue response rejects", async () => {
  await withMock((_req, res) => { res.end("{}"); }, async base => assert.rejects(getProductCatalog("planner", base), /tidak valid/));
});
