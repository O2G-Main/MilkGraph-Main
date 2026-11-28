"use client";

import { useState, type ReactNode } from "react";
import { Download, Eye, Upload } from "lucide-react";
import { apiUpload } from "@/lib/api/client";
import { invalidateResources } from "@/lib/api/resource";
import type { BeImportReport } from "@/lib/api/contract";
import { Button, Icon, Modal } from "@/components/ui";
import { Select } from "@/components/ui/fields";

/** Label data yang didukung endpoint import BE: simulasi (bawaan) atau historis. */
export type ImportDataLabel = "simulasi" | "historis";

export interface ImportColumn<Row> { header: string; numeric?: boolean; cell: (row: Row) => ReactNode }

interface Props<Row> {
  title: string;
  subtitle: string;
  templateCsv: string;
  templateName: string;
  /** Path endpoint import tanpa query, misalnya "/pos/import". */
  importPath: string;
  role: string;
  canImport: boolean;
  /** Penjelasan singkat yang dilihat role tanpa permission import. */
  gateNote: string;
  /** Resource yang diinvalidasi setelah commit berhasil. */
  invalidate: string[];
  columns: ImportColumn<Row>[];
  rowKey: (row: Row, index: number) => string;
}

/**
 * Blok Import CSV dua tahap: Pratinjau (commit=false, tidak menyimpan)
 * lalu Impor sekarang (commit=true, menyimpan baris valid saja).
 * Laporan pratinjau dan commit bentuknya sama dari server.
 */
export function ImportCsvCard<Row>(props: Props<Row>) {
  const { title, subtitle, canImport } = props;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [labelData, setLabelData] = useState<ImportDataLabel>("simulasi");
  const [laporan, setLaporan] = useState<BeImportReport<Row> | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canImport) return null;

  function unduhTemplate() {
    const url = URL.createObjectURL(new Blob([props.templateCsv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = props.templateName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function kirim(commit: boolean) {
    if (!file) return;
    setBusy(commit ? "commit" : "preview");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const rep = await apiUpload<BeImportReport<Row>>(`${props.importPath}?commit=${commit}&label_data=${labelData}`, form, props.role);
      setLaporan(rep);
      if (commit) invalidateResources(props.invalidate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const bisaCommit = !!file && !!laporan && !laporan.commit && busy === null;

  return (
    <>
      <Button variant="secondary" data-tour="import-csv" onClick={() => setOpen(true)}>
        <Icon icon={Upload} size={15} />Import CSV
      </Button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)} className="import-csv-modal">
          <div className="schedule-form">
            <div className="import-csv-head">
              <p className="small muted">{subtitle}</p>
              <Button variant="secondary" onClick={unduhTemplate}>
                <Icon icon={Download} size={15} />Unduh template CSV
              </Button>
            </div>
            <label><span className="field-label">Label data</span>
              <Select label="Label data impor" value={labelData} onChange={v => { setLabelData(v); setLaporan(null); }} options={[{ value: "simulasi", label: "Simulasi" }, { value: "historis", label: "Historis" }]} />
            </label>
            <label><span className="field-label">File CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={e => { setFile(e.target.files?.[0] ?? null); setLaporan(null); setError(null); }} />
            </label>
            {error && <p className="small crit-text" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setOpen(false)}>Tutup</Button>
              <Button variant="secondary" disabled={!file || busy !== null} onClick={() => void kirim(false)}>
                <Icon icon={Eye} size={15} />{busy === "preview" ? "Memeriksa…" : "Pratinjau"}
              </Button>
              <Button variant="primary" disabled={!bisaCommit} onClick={() => void kirim(true)}>
                <Icon icon={Upload} size={15} />{busy === "commit" ? "Mengimpor…" : "Impor sekarang"}
              </Button>
            </div>
            {laporan && (
              <div>
                <p className="small" role="status">
                  Total {laporan.total_baris} baris, {laporan.valid} valid, {laporan.gagal} gagal
                  {laporan.commit ? `, ${laporan.dibuat} data dibuat.` : ". Pratinjau belum menyimpan apa pun."}
                  {laporan.label_data ? ` Label data: ${laporan.label_data}.` : ""}
                </p>
                {!!laporan.rows.length && (
                  <div className="table-wrap"><table className="schedule-table">
                    <thead><tr>{props.columns.map((c, i) => <th key={i} className={c.numeric ? "numeric" : undefined}>{c.header}</th>)}</tr></thead>
                    <tbody>{laporan.rows.map((row, i) => (
                      <tr key={props.rowKey(row, i)}>{props.columns.map((c, j) => <td key={j} className={c.numeric ? "numeric" : undefined}>{c.cell(row)}</td>)}</tr>
                    ))}</tbody>
                  </table></div>
                )}
                {!!laporan.errors.length && (
                  <div className="table-wrap"><table className="schedule-table">
                    <thead><tr><th>Baris</th><th>Kesalahan</th></tr></thead>
                    <tbody>{laporan.errors.map((e, i) => <tr key={i}><td className="numeric">{e.baris}</td><td>{e.pesan}</td></tr>)}</tbody>
                  </table></div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
