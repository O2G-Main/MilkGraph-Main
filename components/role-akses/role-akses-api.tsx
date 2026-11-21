"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { useResource } from "@/lib/api/resource";
import type { BePermission, BeRolesResponse } from "@/lib/api/contract";
import { Badge, Card, Icon, PageHeading, SectionTitle } from "@/components/ui";

/**
 * Role & Hak Akses mode API: registri dibaca dari Backend (GET /roles dan GET /permissions),
 * jadi halaman ini hanya menampilkan, tidak mengedit. Persona, label, dan permission per role
 * semuanya dari server. Tambah, ubah, dan hapus role ditahan di mode ini sampai CRUD tersambung
 * ke POST, PUT, DELETE /roles, supaya tidak ada role yang tampil bisa dibuat tetapi ditolak
 * server saat dipakai login. Pengaturan menu per role juga tidak ditampilkan di mode ini,
 * karena tampil atau tidaknya menu adalah urusan tampilan FE, bukan registri server.
 */
export function RoleAksesApi() {
  const rolesRes = useResource<BeRolesResponse>("/roles");
  const permsRes = useResource<BePermission[]>("/permissions");
  const [selected, setSelected] = useState<string>("planner");

  const data = rolesRes.data;
  if (!data) {
    return <div className="page-enter">
      <PageHeading title="Role & Hak Akses" subtitle="Registri role dan permission dari Backend." />
      {rolesRes.error
        ? <p className="crit-text" role="alert">Gagal memuat registri role: {rolesRes.error.message}</p>
        : <p className="muted" role="status">Memuat registri role…</p>}
    </div>;
  }

  const roles = data.roles;
  const ids = Object.keys(roles);
  const active = roles[selected] ? selected : ids[0];
  const role = roles[active];
  const catalog = new Map((permsRes.data ?? []).map(p => [p.name, p.label]));
  const labelOf = (name: string) => catalog.get(name) ?? data.permissions[name]?.label ?? name;
  const held = new Set(role?.permissions ?? []);

  return (
    <div className="page-enter">
      <PageHeading title="Role & Hak Akses" subtitle="Sumber kebenaran role dan permission adalah Backend. Halaman ini membaca GET /roles dan GET /permissions, persona dan izin mengikuti server." />
      <p className="small muted with-icon"><Icon icon={Lock} size={14} />Mode API: tambah, ubah, dan hapus role ditahan sampai CRUD tersambung ke endpoint role Backend, supaya role yang dibuat bisa dipakai login. Di mode lokal, pengaturan role tetap seperti sebelumnya.</p>
      <div className="role-layout">
        <Card className="role-list-card">
          <SectionTitle title="Role" subtitle={`${ids.length} role terdaftar di server`} />
          <ul className="role-pick">{ids.map(id => (
            <li key={id}><button type="button" aria-pressed={id === active} className={id === active ? "selected" : ""} onClick={() => setSelected(id)}>
              <span><strong>{roles[id].label}</strong><span>{roles[id].user}</span></span>
              <Badge tone={roles[id].builtin ? "neutral" : "ok"}>{roles[id].builtin ? "Bawaan" : "Kustom"}</Badge>
            </button></li>
          ))}</ul>
        </Card>
        <Card className="role-detail">
          <SectionTitle title={role?.label ?? active} subtitle={role?.focus || "Belum ada deskripsi dari server."} />
          <p className="small muted">Persona sesi: {role?.user} ({role?.initials}). Id role: <span className="mono">{active}</span>.</p>
          <h3 className="small"><strong>Permission role ini ({held.size} dari {catalog.size || held.size})</strong></h3>
          <div className="perm-chips">
            {[...held].sort().map(name => <span key={name} className="perm-chip on" title={name}><Icon icon={Check} size={13} />{labelOf(name)}</span>)}
            {!held.size && <span className="small muted">Tidak ada permission tercatat untuk role ini.</span>}
          </div>
          <h3 className="small"><strong>Katalog permission Backend</strong></h3>
          <div className="table-wrap"><table className="access-table">
            <thead><tr><th>Permission</th><th>Label</th><th>Dipegang role ini</th></tr></thead>
            <tbody>{(permsRes.data ?? []).map(p => <tr key={p.name}>
              <td><span className="mono">{p.name}</span></td>
              <td>{p.label}</td>
              <td>{held.has(p.name) ? <Badge tone="ok">Ya</Badge> : <span className="small muted">Tidak</span>}</td>
            </tr>)}
            {!permsRes.data && <tr><td colSpan={3} className="muted">{permsRes.error ? `Katalog permission gagal dimuat: ${permsRes.error.message}` : "Memuat katalog permission…"}</td></tr>}
            </tbody>
          </table></div>
          <p className="small muted">Penegakan izin yang sesungguhnya ada di server: role tanpa permission menerima 403 saat menulis. Tampilan halaman ini hanya membaca registri yang sama.</p>
        </Card>
      </div>
    </div>
  );
}
