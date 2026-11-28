"use client";

import { useState } from "react";
import { Badge, Card, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { filterProducts, parseProductCatalog, productRelations, type CatalogProduct, type ProductCatalog } from "@/lib/api/catalog";
import styles from "./produk.module.css";

function ProductDetail({ product, catalog, onClose }: { product: CatalogProduct; catalog: ProductCatalog; onClose: () => void }) {
  const related = productRelations(catalog, product.sku_id);
  return <Modal title={product.product_name} onClose={onClose}>
    <div className={styles.detail}>
      <dl className={styles.facts}>
        <div><dt className="small muted">Kode SKU cair</dt><dd className="mono">{product.sku_id}</dd></div>
        <div><dt className="small muted">Keluarga produk</dt><dd>{product.product_family}</dd></div>
        <div><dt className="small muted">Rasa</dt><dd>{product.flavour || "Belum tersedia"}</dd></div>
        <div><dt className="small muted">Varian pasar</dt><dd>{related.markets.join(", ") || "Belum tersedia"}</dd></div>
      </dl>
      <section>
        <SectionTitle title="Ukuran kemasan" subtitle="Pilihan kemasan yang tersedia untuk produk ini." />
        {related.packSizes.length ? <div className="table-wrap"><table className="rules-table"><thead><tr><th>Kemasan</th><th>Volume</th><th>Keterangan</th></tr></thead><tbody>{related.packSizes.map(size => <tr key={size.pack_size_code}><td data-label="Kemasan">{size.pack_size_code}</td><td data-label="Volume">{size.exact_size_ml === null ? "Belum tersedia" : `${size.exact_size_ml} ml`}</td><td data-label="Keterangan">{size.description}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada ukuran kemasan untuk produk ini.</p>}
      </section>
      <section>
        <SectionTitle title="SKU produk jadi (Finished SKU)" subtitle="Kode untuk setiap kombinasi produk, ukuran kemasan, dan varian pasar." />
        {related.finishedSkus.length ? <div className="table-wrap"><table className="rules-table"><thead><tr><th>SKU produk jadi</th><th>Kemasan</th><th>Pasar</th></tr></thead><tbody>{related.finishedSkus.map(sku => <tr key={sku.finished_sku_id}><td data-label="SKU produk jadi" className={`${styles.sku} mono`}>{sku.finished_sku_id}</td><td data-label="Kemasan">{sku.pack_size_code}</td><td data-label="Pasar">{sku.market_variant}</td></tr>)}</tbody></table></div> : <p className="muted">Belum ada SKU produk jadi untuk produk ini.</p>}
      </section>
      <button className="button secondary wide" onClick={onClose}>Tutup detail</button>
    </div>
  </Modal>;
}

export function Produk() {
  const resource = useResource<unknown>(API_MODE ? "/production/products" : null);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  let catalog: ProductCatalog | null = null;
  let error = resource.error?.message;
  if (resource.data && !error) {
    try { catalog = parseProductCatalog(resource.data); }
    catch (err) { error = err instanceof Error ? err.message : "Format katalog tidak valid."; }
  }
  const products = catalog ? filterProducts(catalog, search, family) : [];
  const product = catalog?.products.find(row => row.sku_id === selected);

  return <div className={`page-enter ${styles.page}`}>
    <PageHeading title="Master Produk" subtitle="Daftar produk dan pilihan kemasannya. Pilih produk untuk melihat varian pasar dan kode SKU." />
    <Card>
      <SectionTitle title="Katalog produk" subtitle="SKU cair adalah kode produk sebelum dikemas. Gunakan pencarian untuk menemukan produknya." action={<Badge>Hanya baca</Badge>} />
      {!API_MODE ? <p className="muted" role="status">Katalog produk hanya tersedia saat sumber data API aktif.</p> : error ? <div role="alert"><p className="crit-text">Gagal memuat katalog: {error}</p><button className="button secondary" onClick={() => void resource.reload()} disabled={resource.loading}>Coba lagi</button></div> : !catalog ? <p className="muted" role="status">Memuat katalog produk…</p> : <>
        <div className={styles.toolbar}>
          <label className={styles.field}><span className="small muted">Cari produk atau SKU</span><input className="field-control" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama, rasa, atau kode SKU" /></label>
          <div className={styles.field}><label className="small muted" htmlFor="product-family">Keluarga produk</label><Select id="product-family" label="Keluarga produk" value={family} onChange={setFamily} options={[{ value: "", label: "Semua keluarga" }, ...Array.from(new Set(catalog.products.map(row => row.product_family))).sort().map(value => ({ value, label: value }))]} /></div>
        </div>
        <p className={`${styles.summary} muted`} role="status">Menampilkan {products.length} dari {catalog.products.length} produk. Total {catalog.finished_skus.length} SKU produk jadi dalam katalog.</p>
        {!products.length ? <p className="muted">{catalog.products.length ? "Tidak ada produk yang cocok dengan pencarian atau filter." : "Katalog produk belum tersedia."}</p> : <div className="table-wrap"><table className="rules-table"><thead><tr><th>Produk</th><th>SKU cair</th><th>Keluarga produk</th><th>Rasa</th><th>SKU produk jadi</th><th>Detail</th></tr></thead><tbody>{products.map(row => <tr key={row.sku_id}>
          <td data-label="Produk">{row.product_name}</td><td data-label="SKU cair" className="mono">{row.sku_id}</td><td data-label="Keluarga produk">{row.product_family}</td><td data-label="Rasa">{row.flavour || "Belum tersedia"}</td><td data-label="SKU produk jadi">{catalog.finished_skus.filter(sku => sku.liquid_sku_id === row.sku_id).length}</td><td data-label="Detail"><button className="button secondary" onClick={() => setSelected(row.sku_id)} aria-label={`Lihat detail ${row.product_name}`}>Lihat detail</button></td>
        </tr>)}</tbody></table></div>}
      </>}
    </Card>
    {product && catalog && <ProductDetail product={product} catalog={catalog} onClose={() => setSelected(null)} />}
  </div>;
}
