"use client";

import { Fragment, useState, type FormEvent } from "react";
import { Check, Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteRole, saveRole, setRoleMenu, togglePermission, useDemo } from "@/lib/demo";
import { navigation } from "@/lib/nav";
import { ACTIONS, LOCKED, PERMISSIONS, ROLE_IDS, ROLES, SUPERADMIN, can, hiddenFor, isBuiltin, roleLabel, rolesFor, type Action, type Permission, type RoleId } from "@/lib/roles";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { RoleAksesApi } from "./role-akses-api";

/** Semua halaman yang bisa diatur, mengikuti urutan menu; Beranda selalu tampil. */
const PAGES = navigation.flatMap(item => item.tabs.map(t => ({ group: item.label, href: t.href, label: t.label })));
const ALL_HREFS = PAGES.map(p => p.href).filter(h => h !== "/");
const PERMS = Object.keys(PERMISSIONS) as Permission[];
const permsOf = (page: string, action: Action | "lihat") => PERMS.filter(p => PERMISSIONS[p].page === page && PERMISSIONS[p].action === action);
const slug = (label: string) => label.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";

export function RoleAkses() {
  const demo = useDemo();
  const manage = can(demo.role, "users.manage");
  const [selected, setSelected] = useState<RoleId>("planner");
  const [editing, setEditing] = useState<{ isNew: boolean; id: RoleId } | null>(null);
  const [removing, setRemoving] = useState(false);
  // Mode API: registri role dibaca dari Backend, bukan dari registri lokal.
  if (API_MODE) return <RoleAksesApi />;
  const role = ROLES[selected] ? selected : SUPERADMIN;
  const isAdmin = role === SUPERADMIN;
  const hidden = hiddenFor(role);
  const usersOf = (id: RoleId) => demo.users.filter(u => u.role === id);
  const editable = manage && !isAdmin;

  /** Tombol izin per tindakan; Superadmin selalu memegang semua izin. */
  const chip = (p: Permission, visible: boolean) => {
    const on = can(role, p);
    const fixed = !editable || LOCKED.includes(p) || !visible;
    return <button key={p} type="button" className={`perm-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={fixed}
      title={LOCKED.includes(p) ? "Hanya Superadmin" : !visible ? "Tampilkan menunya dulu" : PERMISSIONS[p].label}
      onClick={() => togglePermission(p, role)}>
      <Icon icon={on ? Check : Plus} size={13} />{PERMISSIONS[p].short}
    </button>;
  };

  return (
    <div className="page-enter">
      <PageHeading title="Role & Hak Akses" subtitle="Atur role, menu yang tampil, dan tindakan yang boleh dilakukan di tiap menu. Pembagian awal mengikuti tujuh role bawaan; Superadmin bisa menyesuaikannya kapan saja.">
        {manage && <button className="button primary" onClick={() => setEditing({ isNew: true, id: "" })}><Icon icon={Plus} size={16} />Tambah role</button>}
      </PageHeading>
      <div className="role-layout">
        <Card className="role-list-card">
          <SectionTitle title="Role" subtitle={`${ROLE_IDS.length} role, ${demo.users.filter(u => u.active).length} pengguna aktif`} />
          <ul className="role-pick">{ROLE_IDS.map(id => (
            <li key={id}><button type="button" aria-pressed={id === role} className={id === role ? "selected" : ""} onClick={() => setSelected(id)}>
              <span><strong>{roleLabel(id)}</strong><span>{usersOf(id).length} pengguna</span></span>
              {!isBuiltin(id) && <Badge tone="ok">Baru</Badge>}
            </button></li>
          ))}</ul>
        </Card>
        <Card className="role-detail">
          <SectionTitle title={roleLabel(role)} subtitle={ROLES[role]?.focus || "Belum ada deskripsi."} action={manage && !isAdmin ? <div className="page-actions">
            <button className="button secondary" onClick={() => setEditing({ isNew: false, id: role })}><Icon icon={Pencil} size={15} />Ubah</button>
            {!isBuiltin(role) && <button className="button secondary" disabled={usersOf(role).length > 0} title={usersOf(role).length ? "Pindahkan penggunanya ke role lain dulu" : undefined} onClick={() => setRemoving(true)}><Icon icon={Trash2} size={15} />Hapus</button>}
          </div> : undefined} />
          {isAdmin && <p className="small muted with-icon"><Icon icon={Lock} size={14} />Superadmin selalu melihat semua menu dan bisa melakukan semua tindakan, jadi tidak bisa diatur.</p>}
          <div className="table-wrap">
            <table className="access-table">
              <thead><tr><th>Menu</th><th>Tampil</th>{ACTIONS.map(a => <th key={a.id}>{a.label}</th>)}</tr></thead>
              <tbody>
                {navigation.map(item => <Fragment key={item.label}>
                  {item.tabs.length > 1 && <tr className="access-group"><td colSpan={2 + ACTIONS.length}>{item.label}</td></tr>}
                  {item.tabs.map(t => {
                    const visible = !hidden.includes(t.href);
                    return <tr key={t.href}>
                      <td>{item.tabs.length > 1 ? t.label : item.label}</td>
                      <td data-label="Tampil">{t.href === "/"
                        ? <span className="small muted">Selalu</span>
                        : <input type="checkbox" aria-label={`Tampilkan ${t.label} untuk ${roleLabel(role)}`} checked={visible} disabled={!editable} onChange={e => setRoleMenu(role, t.href, e.target.checked, hidden)} />}</td>
                      {ACTIONS.map(a => <td key={a.id} data-label={a.label}><div className="perm-chips">{permsOf(t.href, a.id).map(p => chip(p, visible))}</div></td>)}
                    </tr>;
                  })}
                </Fragment>)}
                <tr className="access-group"><td colSpan={2 + ACTIONS.length}>Lainnya</td></tr>
                <tr>
                  <td>Riwayat Persetujuan</td>
                  <td data-label="Tampil"><div className="perm-chips">{chip("audit.view", true)}</div></td>
                  {ACTIONS.map(a => <td key={a.id} data-label={a.label}><div className="perm-chips">{permsOf("/persetujuan", a.id).map(p => chip(p, can(role, "audit.view")))}</div></td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">Halaman detail ikut menu induknya: Bay & Tangki dan Lini Filling ikut Kondisi Alat, Pasokan dan Constraint ikut Kelayakan & keputusan, Trace ikut Riwayat Produksi. Perubahan langsung berlaku dan tercatat di Riwayat Persetujuan.</p>
        </Card>
      </div>
      {editing && <RoleDialog isNew={editing.isNew} id={editing.id} onClose={() => setEditing(null)} onSaved={id => setSelected(id)} />}
      {removing && <Modal title={`Hapus role ${roleLabel(role)}?`} onClose={() => setRemoving(false)}>
        <p className="muted">Menu dan izin role ini ikut dihapus. Tindakan ini tercatat di Riwayat Persetujuan.</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setRemoving(false)}>Batal</button>
          <button className="button primary" onClick={() => { deleteRole(role); setRemoving(false); setSelected("planner"); }}><Icon icon={Trash2} size={16} />Hapus role</button>
        </div>
      </Modal>}
    </div>
  );
}

function RoleDialog({ isNew, id, onClose, onSaved }: { isNew: boolean; id: RoleId; onClose: () => void; onSaved: (id: RoleId) => void }) {
  const [label, setLabel] = useState(isNew ? "" : roleLabel(id));
  const [focus, setFocus] = useState(isNew ? "" : ROLES[id]?.focus ?? "");
  const [copyFrom, setCopyFrom] = useState<RoleId | "">("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = label.trim();
    if (!name) return setError("Isi nama role.");
    if (ROLE_IDS.some(r => r !== id && roleLabel(r).toLowerCase() === name.toLowerCase())) return setError("Nama role ini sudah dipakai.");
    if (isNew) {
      let next = slug(name);
      while (ROLE_IDS.includes(next)) next += "-2";
      // Role baru mulai dari menu dan izin role sumber, atau hanya Beranda bila tidak menyalin.
      const hidden = copyFrom ? hiddenFor(copyFrom) : ALL_HREFS;
      const grants = copyFrom ? PERMS.filter(p => !LOCKED.includes(p) && rolesFor(p).includes(copyFrom)) : [];
      saveRole({ id: next, label: name, focus: focus.trim() }, true, hidden, grants);
      onSaved(next);
    } else {
      saveRole({ id, label: name, focus: focus.trim() }, false);
    }
    onClose();
  }

  return (
    <Modal title={isNew ? "Tambah role" : `Ubah role ${roleLabel(id)}`} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <label><span className="field-label">Nama role</span><input value={label} onChange={e => { setLabel(e.target.value); setError(null); }} maxLength={40} placeholder="Contoh: Admin Gudang" /></label>
        <label><span className="field-label">Deskripsi tugas</span><textarea value={focus} onChange={e => setFocus(e.target.value)} rows={2} maxLength={200} placeholder="Contoh: Mengatur stok barang jadi dan pengiriman lot" /></label>
        {isNew && <label><span className="field-label">Salin menu dan izin dari (opsional)</span><Select label="Salin menu dan izin dari" value={copyFrom} onChange={v => setCopyFrom(v)} placeholder="Mulai dari Beranda saja" options={[{ value: "", label: "Mulai dari Beranda saja" }, ...ROLE_IDS.filter(r => r !== SUPERADMIN).map(r => ({ value: r, label: roleLabel(r) }))]} /></label>}
        {isNew && <p className="small muted with-icon"><Icon icon={Copy} size={14} />Setelah dibuat, atur menu dan tindakannya di tabel, lalu tetapkan role ke pengguna di halaman Pengguna.</p>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">{isNew ? "Buat role" : "Simpan"}</button>
        </div>
      </form>
    </Modal>
  );
}
