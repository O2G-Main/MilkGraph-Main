"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, UserPlus } from "lucide-react";
import { addUser, updateUser, useDemo, type DemoUser } from "@/lib/demo";
import { ROLE_IDS, SUPERADMIN, can, roleLabel, type Role, type RoleId } from "@/lib/roles";
import { ASSETS, STAGES } from "@/lib/assets";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";

const SUBTITLE = "Tetapkan role dan alat/lini yang ditugaskan untuk setiap pengguna. Menu dan tindakan tiap role diatur di Role & Hak Akses.";

export function Pengguna() {
  const demo = useDemo();
  const rolesRes = useResource<{ roles: Record<RoleId, Role> }>(API_MODE ? "/roles" : null);
  // Pengelolaan pengguna baru tersedia di mode lokal; mode API menunggu endpoint backend.
  const manage = !API_MODE && can(demo.role, "users.manage");

  if (API_MODE) {
    return (
      <div className="page-enter">
        <PageHeading title="Pengguna" subtitle={SUBTITLE} />
        {rolesRes.error ? <p className="crit-text" role="alert">Gagal memuat peran: {rolesRes.error.message}</p>
          : !rolesRes.data ? <p className="muted" role="status">Memuat data peran…</p>
          : <Card><SectionTitle title="Role terdaftar" /><ul className="attention-list">{Object.entries(rolesRes.data.roles).map(([id, r]) => <li key={id} className="attention-item"><span className="attention-copy"><strong>{r.label}</strong><span>{r.user}</span></span></li>)}</ul></Card>}
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeading title="Pengguna" subtitle={SUBTITLE}>
        {can(demo.role, "users.manage") && <Link className="button secondary" href="/role-akses">Atur role & hak akses<Icon icon={ArrowRight} size={16} /></Link>}
      </PageHeading>
      <UserList manage={manage} />
    </div>
  );
}

/** Ringkasan alat yang ditugaskan, mis. "F1, F2, F4 +4". */
const assetsText = (assets?: string[]) => (!assets?.length ? "Tidak dibatasi" : assets.length > 4 ? `${assets.slice(0, 4).join(", ")} +${assets.length - 4}` : assets.join(", "));

function UserList({ manage }: { manage: boolean }) {
  const { users } = useDemo();
  const [name, setName] = useState("");
  const [role, setNewRole] = useState<RoleId>("planner");
  const [assigning, setAssigning] = useState<DemoUser | null>(null);
  const roleOptions = ROLE_IDS.map(id => ({ value: id, label: roleLabel(id) }));
  const activeAdmins = users.filter(u => u.role === SUPERADMIN && u.active).length;
  const isLastAdmin = (u: DemoUser) => u.role === SUPERADMIN && u.active && activeAdmins === 1;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    addUser(trimmed, role);
    setName("");
  }

  return (
    <Card className="user-list">
      <SectionTitle title="Daftar pengguna" subtitle={`${users.filter(u => u.active).length} aktif dari ${users.length} akun`} />
      <div className="table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Nama</th><th>Role</th><th>Alat/lini ditugaskan</th><th>Status</th>{manage && <th className="numeric">Aksi</th>}</tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td data-label="Nama"><strong>{u.name}</strong></td>
                <td data-label="Role">
                  {manage && !isLastAdmin(u)
                    ? <Select compact label={`Role ${u.name}`} value={u.role} onChange={next => next !== u.role && updateUser(u.id, { role: next })} options={roleOptions} />
                    : roleLabel(u.role)}
                </td>
                <td data-label="Alat/lini">
                  <span className="user-assets">{u.role === SUPERADMIN ? <span className="small muted">Semua alat</span> : <span className="small">{assetsText(u.assets)}</span>}
                    {manage && u.role !== SUPERADMIN && <button className="icon-button" aria-label={`Atur alat dan lini ${u.name}`} onClick={() => setAssigning(u)}><Icon icon={Pencil} size={15} /></button>}
                  </span>
                </td>
                <td data-label="Status"><Badge tone={u.active ? "ok" : "neutral"}>{u.active ? "Aktif" : "Nonaktif"}</Badge></td>
                {manage && (
                  <td data-label="Aksi" className="numeric">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={isLastAdmin(u)}
                      title={isLastAdmin(u) ? "Minimal satu Superadmin harus tetap aktif." : undefined}
                      onClick={() => updateUser(u.id, { active: !u.active })}
                    >
                      {u.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manage && (
        <form className="user-add" onSubmit={submit}>
          <label>
            <span className="field-label">Nama pengguna baru</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Wulan Pratiwi" autoComplete="off" required maxLength={60} />
          </label>
          <label>
            <span className="field-label">Role</span>
            <Select label="Role pengguna baru" value={role} onChange={setNewRole} options={roleOptions} />
          </label>
          <button type="submit" className="button primary" disabled={!name.trim()}>
            <Icon icon={UserPlus} size={16} />
            Tambah pengguna
          </button>
        </form>
      )}
      {assigning && <AssetDialog user={assigning} onClose={() => setAssigning(null)} />}
    </Card>
  );
}

/** Penugasan alat/lini: membatasi order, mesin, downtime, dan transfer bahan yang bisa dicatat pengguna. */
function AssetDialog({ user, onClose }: { user: DemoUser; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(user.assets ?? []);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const stages = [...STAGES].reverse().filter(st => ASSETS.some(a => a.stage === st));

  return (
    <Modal title={`Alat dan lini ${user.name}`} onClose={onClose} className="lab-entry-modal">
      <form className="schedule-form" onSubmit={e => { e.preventDefault(); updateUser(user.id, { assets: picked.length ? picked : undefined }); onClose(); }}>
        <p className="muted">Pengguna hanya bisa mencatat produksi, kondisi mesin, downtime, dan transfer bahan di alat yang dipilih. Kosongkan bila tidak dibatasi.</p>
        <div className="asset-pick">{stages.map(st => (
          <fieldset key={st}>
            <legend>{st}</legend>
            {ASSETS.filter(a => a.stage === st).map(a => (
              <label key={a.id} className="check-row"><input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} /><span className="mono">{a.id}</span></label>
            ))}
          </fieldset>
        ))}</div>
        <div className="dialog-actions">
          <span className="small muted">{picked.length ? `${picked.length} alat dipilih` : "Tidak dibatasi"}</span>
          <button type="button" className="button secondary" onClick={() => setPicked([])}>Kosongkan</button>
          <button type="submit" className="button primary">Simpan penugasan</button>
        </div>
      </form>
    </Modal>
  );
}
