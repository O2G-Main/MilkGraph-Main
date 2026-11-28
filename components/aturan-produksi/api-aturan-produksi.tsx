"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, PageHeading, SectionTitle, Table } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { useDemo } from "@/lib/demo";
import { useResource } from "@/lib/api/resource";
import { classifyChangeover, parseMasterRules, parseProductCatalog, validateChangeoverPair, type MasterRules, type ProductCatalog, type ChangeoverResult } from "@/lib/api/catalog";
import styles from "./api-aturan-produksi.module.css";

function ChangeoverClassifier({ catalog, role }: { catalog: ProductCatalog; role: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ChangeoverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = catalog.finished_skus.map(sku => ({ value: sku.finished_sku_id, label: sku.finished_sku_id, hint: catalog.products.find(product => product.sku_id === sku.liquid_sku_id)?.product_name }));
  function change(side: "from" | "to", value: string) {
    if (side === "from") setFrom(value); else setTo(value);
    setResult(null);
    setError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setResult(null);
    const validation = validateChangeoverPair(catalog, from, to);
    setError(validation);
    if (validation) return;
    setPending(true);
    try { setResult(await classifyChangeover(catalog, from, to, role)); }
    catch (err) { setError(err instanceof Error ? err.message : "Klasifikasi gagal. Coba lagi."); }
    finally { setPending(false); }
  }
  if (!options.length) return <p className="muted" role="status">Belum ada finished SKU. Klasifikasi belum dapat dijalankan.</p>;
  return <>
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <div className={styles.field}><label className="small muted" htmlFor="changeover-from">Dari finished SKU</label><Select id="changeover-from" label="Dari finished SKU" value={from} onChange={value => change("from", value)} options={options} placeholder="Pilih SKU asal" disabled={pending} searchable /></div>
      <div className={styles.field}><label className="small muted" htmlFor="changeover-to">Ke finished SKU</label><Select id="changeover-to" label="Ke finished SKU" value={to} onChange={value => change("to", value)} options={options} placeholder="Pilih SKU tujuan" disabled={pending} searchable /></div>
      <Button variant="primary" type="submit" disabled={pending}>{pending ? "Mengklasifikasikan…" : "Klasifikasikan"}</Button>
    </form>
    {pending && <p className="small muted" role="status">Memeriksa aturan transisi SKU…</p>}
    {error && <p className="crit-text" role="alert">{error}</p>}
    {result && <div className={styles.result} role="status">
      <dl className={styles.facts}>
        <div><dt className="small muted">Aktivitas</dt><dd>{result.activity}</dd></div>
        <div><dt className="small muted">Aturan</dt><dd>{result.ruleId}</dd></div>
        <div><dt className="small muted">Prioritas</dt><dd>{result.precedence}</dd></div>
        <div><dt className="small muted">CIP transisi</dt><dd><Badge tone={result.requiresCip ? "warn" : "neutral"}>{result.requiresCip ? "Wajib CIP" : "Tidak dipicu transisi ini"}</Badge></dd></div>
      </dl>
      <p className="small muted">Kondisi: {result.condition}</p>
      {result.cipRuleId && <p>Aturan CIP: {result.cipRuleId}</p>}
      {result.cipRequirement && <p>{result.cipRequirement}</p>}
      {result.additionalNote && <p className="small muted">{result.additionalNote}</p>}
      <p className="small muted">Klasifikasi bukan izin produksi. Trigger CIP lain tetap mengikuti aturan master.</p>
    </div>}
  </>;
}

export function ApiAturanProduksi() {
  const { role } = useDemo();
  const rulesResource = useResource<unknown>("/master/rules");
  const catalogResource = useResource<unknown>("/production/products");
  let rules: MasterRules | null = null;
  let catalog: ProductCatalog | null = null;
  let rulesError = rulesResource.error?.message;
  let catalogError = catalogResource.error?.message;
  if (rulesResource.data && !rulesError) {
    try { rules = parseMasterRules(rulesResource.data); }
    catch (err) { rulesError = err instanceof Error ? err.message : "Format aturan tidak valid."; }
  }
  if (catalogResource.data && !catalogError) {
    try { catalog = parseProductCatalog(catalogResource.data); }
    catch (err) { catalogError = err instanceof Error ? err.message : "Format katalog tidak valid."; }
  }
  return <div className="page-enter">
    <PageHeading title="Aturan Produksi" subtitle="Aturan changeover, CIP, constraint, dan satuan aset dari master API. Aturan master hanya dapat dibaca." />
    <Card className="rules-card">
      <SectionTitle title="Klasifikasi changeover" subtitle="Periksa transisi dua finished SKU tanpa mengubah aturan atau jadwal produksi." />
      {catalogError ? <div role="alert"><p className="crit-text">Gagal memuat SKU: {catalogError}</p><Button variant="secondary" disabled={catalogResource.loading} onClick={() => void catalogResource.reload()}>Coba lagi</Button></div> : !catalog ? <p className="muted" role="status">Memuat pilihan SKU…</p> : <ChangeoverClassifier key={role} catalog={catalog} role={role} />}
    </Card>
    {rulesError ? <Card><div role="alert"><p className="crit-text">Gagal memuat aturan master: {rulesError}</p><Button variant="secondary" disabled={rulesResource.loading} onClick={() => void rulesResource.reload()}>Coba lagi</Button></div></Card> : !rules ? <Card><p className="muted" role="status">Memuat aturan master…</p></Card> : <>
      <Card className="rules-card">
        <SectionTitle title="Changeover antar-produk" subtitle="Prioritas dan durasi dari aturan master; CIP tetap diperiksa terpisah." action={<Badge>Hanya baca</Badge>} />
        {!rules.changeover.length ? <p className="muted">Belum ada aturan changeover.</p> : <Table variant="rules"><thead><tr><th>Aturan</th><th>Aktivitas</th><th>Kondisi</th><th>Durasi</th><th>Prioritas</th><th>Catatan</th></tr></thead><tbody>{rules.changeover.map(rule => <tr key={rule.rule_id}><td data-label="Aturan">{rule.rule_id}</td><td data-label="Aktivitas">{rule.activity}</td><td data-label="Kondisi">{rule.condition}</td><td data-label="Durasi">{rule.duration_minutes} menit</td><td data-label="Prioritas">{rule.precedence}</td><td data-label="Catatan">{rule.additional_note}</td></tr>)}</tbody></Table>}
      </Card>
      <Card className="rules-card">
        <SectionTitle title="Aturan CIP" subtitle="Trigger, cakupan aset, dan kewajiban pembersihan dari master." />
        {!rules.cip.length ? <p className="muted">Belum ada aturan CIP.</p> : <Table variant="rules"><thead><tr><th>Aturan</th><th>Trigger</th><th>Cakupan aset</th><th>Ketentuan</th></tr></thead><tbody>{rules.cip.map(rule => <tr key={rule.rule_id}><td data-label="Aturan">{rule.rule_id}</td><td data-label="Trigger">{rule.trigger}</td><td data-label="Cakupan aset">{rule.asset_scope}</td><td data-label="Ketentuan">{rule.requirement}</td></tr>)}</tbody></Table>}
      </Card>
      <Card className="rules-card">
        <SectionTitle title="Constraint produksi" subtitle="Batas operasional dan ketentuan perencanaan dari master." />
        {!rules.constraints.length ? <p className="muted">Belum ada constraint produksi.</p> : <Table variant="rules"><thead><tr><th>Aturan</th><th>Cakupan</th><th>Ketentuan</th></tr></thead><tbody>{rules.constraints.map(rule => <tr key={rule.rule_id}><td data-label="Aturan">{rule.rule_id}</td><td data-label="Cakupan">{rule.scope}</td><td data-label="Ketentuan">{rule.description}</td></tr>)}</tbody></Table>}
      </Card>
      <Card className="rules-card">
        <SectionTitle title="Satuan parameter aset" subtitle="Definisi satuan agar kapasitas, laju alir, dan kecepatan kemasan tidak tertukar." />
        {!rules.asset_units.length ? <p className="muted">Belum ada definisi satuan aset.</p> : <Table variant="rules"><thead><tr><th>Parameter</th><th>Satuan</th><th>Berlaku untuk</th><th>Definisi</th></tr></thead><tbody>{rules.asset_units.map(unit => <tr key={unit.field}><td data-label="Parameter">{unit.field}</td><td data-label="Satuan">{unit.unit}</td><td data-label="Berlaku untuk">{unit.applies_to}</td><td data-label="Definisi">{unit.definition}</td></tr>)}</tbody></Table>}
      </Card>
    </>}
  </div>;
}
