import { apiGet, apiSend } from "./client.ts";

export interface CatalogProduct { sku_id: string; product_name: string; product_family: string; flavour: string }
export interface PackSize { pack_size_code: string; description: string; exact_size_ml: number | null }
export interface FinishedSku { finished_sku_id: string; liquid_sku_id: string; pack_size_code: string; market_variant: string }
export interface ProductCatalog {
  products: CatalogProduct[];
  pack_size_codes: PackSize[];
  product_pack_sizes: { sku_id: string; pack_size_code: string }[];
  product_market_variants: { sku_id: string; market_variant: string }[];
  finished_skus: FinishedSku[];
}
export interface ChangeoverRule { rule_id: string; activity: string; condition: string; duration_minutes: string | number; precedence: string; additional_note: string }
export interface CipRule { rule_id: string; trigger: string; asset_scope: string; requirement: string }
export interface ConstraintRule { rule_id: string; scope: string; description: string }
export interface AssetUnit { field: string; unit: string; applies_to: string; definition: string }
export interface MasterRules { changeover: ChangeoverRule[]; cip: CipRule[]; constraints: ConstraintRule[]; asset_units: AssetUnit[] }
export interface ChangeoverResult {
  ruleId: string; activity: string; precedence: string; condition: string; requiresCip: boolean;
  cipRuleId?: string; cipRequirement?: string; additionalNote?: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Format respons API tidak valid.");
  return value as Record<string, unknown>;
}
function rows(value: unknown, fields: string[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Daftar master pada respons API tidak valid.");
  return value.map(item => {
    const row = object(item);
    if (fields.some(key => typeof row[key] !== "string")) throw new Error("Kolom master pada respons API tidak valid.");
    return row;
  });
}

export function parseProductCatalog(value: unknown): ProductCatalog {
  const data = object(value);
  const products = rows(data.products, ["sku_id", "product_name", "product_family", "flavour"]) as unknown as CatalogProduct[];
  const sizes = rows(data.pack_size_codes, ["pack_size_code", "description"]);
  if (sizes.some(row => row.exact_size_ml !== null && (typeof row.exact_size_ml !== "number" || !Number.isFinite(row.exact_size_ml)))) throw new Error("Ukuran kemasan pada respons API tidak valid.");
  return {
    products,
    pack_size_codes: sizes as unknown as PackSize[],
    product_pack_sizes: rows(data.product_pack_sizes, ["sku_id", "pack_size_code"]) as unknown as ProductCatalog["product_pack_sizes"],
    product_market_variants: rows(data.product_market_variants, ["sku_id", "market_variant"]) as unknown as ProductCatalog["product_market_variants"],
    finished_skus: rows(data.finished_skus, ["finished_sku_id", "liquid_sku_id", "pack_size_code", "market_variant"]) as unknown as FinishedSku[],
  };
}

export function filterProducts(catalog: ProductCatalog, search: string, family: string): CatalogProduct[] {
  const query = search.trim().toLocaleLowerCase("id");
  return catalog.products.filter(product => {
    if (family && product.product_family !== family) return false;
    const skus = catalog.finished_skus.filter(sku => sku.liquid_sku_id === product.sku_id);
    return !query || [product.sku_id, product.product_name, product.product_family, product.flavour, ...skus.map(sku => sku.finished_sku_id)].some(text => text.toLocaleLowerCase("id").includes(query));
  });
}

export function productRelations(catalog: ProductCatalog, skuId: string) {
  const sizeCodes = new Set(catalog.product_pack_sizes.filter(row => row.sku_id === skuId).map(row => row.pack_size_code));
  return {
    packSizes: catalog.pack_size_codes.filter(size => sizeCodes.has(size.pack_size_code)),
    markets: catalog.product_market_variants.filter(row => row.sku_id === skuId).map(row => row.market_variant),
    finishedSkus: catalog.finished_skus.filter(row => row.liquid_sku_id === skuId),
  };
}
export async function getProductCatalog(role: string, base?: string): Promise<ProductCatalog> {
  return parseProductCatalog(await apiGet<unknown>("/production/products", role, base));
}

export function parseMasterRules(value: unknown): MasterRules {
  const data = object(value);
  // The CSV master endpoint uses camelCase; accept its normalized aliases too.
  const changeover = rows(data.changeover ?? data.changeoverRules, ["rule_id", "activity", "condition", "precedence", "additional_note"]);
  if (changeover.some(row => !["string", "number"].includes(typeof row.duration_minutes))) throw new Error("Durasi changeover pada respons API tidak valid.");
  return {
    changeover: changeover as unknown as ChangeoverRule[],
    cip: rows(data.cip ?? data.cipRules, ["rule_id", "trigger", "asset_scope", "requirement"]) as unknown as CipRule[],
    constraints: rows(data.constraints ?? data.constraintCatalog, ["rule_id", "scope", "description"]) as unknown as ConstraintRule[],
    asset_units: rows(data.asset_units ?? data.assetUnits, ["field", "unit", "applies_to", "definition"]) as unknown as AssetUnit[],
  };
}
export async function getMasterRules(role: string, base?: string): Promise<MasterRules> {
  return parseMasterRules(await apiGet<unknown>("/master/rules", role, base));
}
export function validateChangeoverPair(catalog: ProductCatalog, from: string, to: string): string | null {
  if (!from || !to) return "Pilih SKU asal dan SKU tujuan.";
  if (![from, to].every(id => catalog.finished_skus.some(sku => sku.finished_sku_id === id))) return "SKU harus berasal dari katalog API yang tersedia.";
  return null;
}
export async function classifyChangeover(catalog: ProductCatalog, from: string, to: string, role: string, base?: string): Promise<ChangeoverResult> {
  const validation = validateChangeoverPair(catalog, from, to);
  if (validation) throw new Error(validation);
  const data = object(await apiSend<unknown>("POST", "/master/changeover/classify", { from, to }, role, base));
  if (["ruleId", "activity", "precedence", "condition"].some(key => typeof data[key] !== "string") || typeof data.requiresCip !== "boolean") throw new Error("Hasil klasifikasi pada respons API tidak valid.");
  for (const key of ["cipRuleId", "cipRequirement", "additionalNote"]) {
    if (data[key] !== undefined && data[key] !== null && typeof data[key] !== "string") throw new Error("Hasil klasifikasi pada respons API tidak valid.");
  }
  return data as unknown as ChangeoverResult;
}
