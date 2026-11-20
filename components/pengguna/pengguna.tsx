"use client";

import { useState, type FormEvent } from "react";
import { Check, Minus, ShieldCheck, UserPlus } from "lucide-react";
import { addUser, togglePermission, updateUser, useDemo } from "@/lib/demo";
import { LOCKED, PERMISSIONS, ROLE_IDS, ROLES, SUPERADMIN, can, rolesFor, type Permission, type Role, type RoleId } from "@/lib/roles";
import { Badge, Card, Icon, PageHeading, RoleNote, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";

interface RolesPayload {
  roles: Record<RoleId, Role>;
  permissions: Record<Permission, { label: string; roles: RoleId[] }>;
}

const SUBTITLE = "Superadmin dan empat peran operasional. Peran aktif menentukan keputusan yang boleh diambil di setiap halaman.";

export function Pengguna() {
  const demo = useDemo();
  const rolesRes = useResource<RolesPayload>(API_MODE ? "/roles" : null);

  if (API_MODE && rolesRes.loading && !rolesRes.data) {
    return (
      <div className="page-enter" role="status">
        <PageHeading title="Pengguna & Peran" subtitle={SUBTITLE} />
        <p className="muted">Memuat data peran…</p>
      </div>
    );
  }

  if (API_MODE && rolesRes.error) {
    return (
      <div className="page-enter" role="alert">
        <PageHeading title="Pengguna & Peran" subtitle={SUBTITLE} />
        <p className="crit-text">Gagal memuat peran: {rolesRes.error.message}</p>
      </div>
    );
  }

  const roleMap: Record<RoleId, Role> = API_MODE && rolesRes.data?.roles ? rolesRes.data.roles : ROLES;
  const roleIds: RoleId[] = API_MODE && rolesRes.data?.roles ? (Object.keys(rolesRes.data.roles) as RoleId[]) : ROLE_IDS;
  const permissionMap: Record<Permission, { label: string; roles: RoleId[] }> =
    API_MODE && rolesRes.data?.permissions ? rolesRes.data.permissions : PERMISSIONS;
  const holders = (p: Permission) => (API_MODE ? permissionMap[p]?.roles ?? [] : rolesFor(p));
  // Pengelolaan akses baru tersedia di mode lokal; mode API menunggu endpoint backend.
  const manage = !API_MODE && can(demo.role, "users.manage");

  if (API_MODE && roleIds.length === 0) {
    return (
      <div className="page-enter" role="status">
        <PageHeading title="Pengguna & Peran" subtitle={SUBTITLE} />
        <p className="muted">Tidak ada peran yang terdaftar.</p>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeading title="Pengguna & Peran" subtitle={SUBTITLE} />
      {!API_MODE && <UserList manage={manage} />}
      <Card>
        <SectionTitle
          title="Hak akses"
          subtitle={manage ? "Klik sel untuk memberi atau mencabut izin. Kolom Superadmin selalu aktif." : undefined}
        />
        <div className="table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Keputusan</th>
                {roleIds.map(id => (
                  <th key={id} className="numeric">
                    {roleMap[id]?.label ?? id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(permissionMap) as Permission[]).map(p => (
                <tr key={p}>
                  <td>{permissionMap[p]?.label ?? p}</td>
                  {roleIds.map(id => {
                    const yes = holders(p).includes(id);
                    const mark = (
                      <>
                        <Icon icon={yes ? Check : Minus} size={16} className={yes ? "ok-text" : "muted"} />
                        <span className="sr-only">{yes ? "Boleh" : "Tidak"}</span>
                      </>
                    );
                    const fixed = id === SUPERADMIN || LOCKED.includes(p);
                    return (
                      <td key={id} data-label={roleMap[id]?.label ?? id} className="numeric">
                        {manage && !fixed ? (
                          <button
                            type="button"
                            className="matrix-toggle"
                            aria-pressed={yes}
                            aria-label={`${roleMap[id]?.label ?? id}: ${permissionMap[p]?.label ?? p}`}
                            onClick={() => togglePermission(p, id)}
                          >
                            {mark}
                          </button>
                        ) : manage ? <span className="matrix-toggle">{mark}</span> : mark}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted with-icon">
          <Icon icon={ShieldCheck} size={14} />
          Manusia yang memutuskan: rekomendasi jadwal dan daftar hold tidak berlaku sebelum disetujui peran yang berwenang. Setiap perubahan akses tercatat di Riwayat Persetujuan. Login sungguhan di luar scope mockup.
        </p>
      </Card>
    </div>
  );
}

function UserList({ manage }: { manage: boolean }) {
  const { users } = useDemo();
  const [name, setName] = useState("");
  const [role, setNewRole] = useState<RoleId>("planner");
  const roleOptions = ROLE_IDS.map(id => ({ value: id, label: ROLES[id].label }));
  const activeAdmins = users.filter(u => u.role === SUPERADMIN && u.active).length;
  const isLastAdmin = (u: (typeof users)[number]) => u.role === SUPERADMIN && u.active && activeAdmins === 1;

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
      <RoleNote permission="users.manage" />
      <div className="table-wrap">
        <table className="user-table">
          <thead>
            <tr><th>Nama</th><th>Peran</th><th>Status</th>{manage && <th className="numeric">Aksi</th>}</tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.active ? "" : "muted"}>
                <td data-label="Nama"><strong>{u.name}</strong></td>
                <td data-label="Peran">
                  {manage && !isLastAdmin(u)
                    ? <Select compact label={`Peran ${u.name}`} value={u.role} onChange={next => next !== u.role && updateUser(u.id, { role: next })} options={roleOptions} />
                    : ROLES[u.role].label}
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
            <span className="field-label">Peran</span>
            <Select label="Peran pengguna baru" value={role} onChange={setNewRole} options={roleOptions} />
          </label>
          <button type="submit" className="button primary" disabled={!name.trim()}>
            <Icon icon={UserPlus} size={16} />
            Tambah pengguna
          </button>
        </form>
      )}
    </Card>
  );
}
