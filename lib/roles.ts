export type RoleId = "superadmin" | "planner" | "receiving" | "operator" | "lab" | "qa";
export type Permission =
  | "schedule.edit" | "rules.edit" | "plan.simulate"
  | "arrival.edit" | "queue.record" | "transfer.record" | "lab.record"
  | "production.record" | "equipment.update" | "process.transfer" | "qc.record" | "quality.rules"
  | "demand.send" | "plan.decide" | "constraint.edit" | "hold.submit" | "hold.review" | "lab.decide" | "instruction.ack"
  | "users.manage" | "master.manage" | "integration.manage" | "audit.view";

export const ROLES: Record<RoleId, { label: string; user: string; initials: string; focus: string }> = {
  superadmin: { label: "Superadmin", user: "Bagas Wicaksono", initials: "BW", focus: "Mengelola pengguna, peran, master data, dan konfigurasi integrasi. Semua menu dan tindakan terbuka, termasuk riwayat seluruh perubahan dan persetujuan." },
  planner: { label: "Planner PPIC", user: "Rino Akbar Hanif", initials: "RA", focus: "Rencana shift yang layak dan keputusan saat gangguan." },
  receiving: { label: "Koordinator receiving", user: "Dimas Prasetyo", initials: "DP", focus: "Urutan RT, bay yang siap, dan RT yang mendekati batas holding time." },
  operator: { label: "Operator produksi", user: "Hendra Kusuma", initials: "HK", focus: "Target dan realisasi produksi di lini yang ditugaskan, kondisi mesin, dan downtime." },
  qa: { label: "QA/QC", user: "Ratna Maharani", initials: "RM", focus: "Rilis atau tolak susu dari hasil lab, mutu barang jadi, penelusuran batch, dan hold produk." },
  lab: { label: "Lab", user: "Sri Lestari", initials: "SL", focus: "Sampel RT dan batch proses yang perlu diperiksa, lalu hasil ujinya dimasukkan ke Tes Lab." },
};
export const ROLE_IDS = Object.keys(ROLES) as RoleId[];
export type Role = (typeof ROLES)[RoleId];
export const SUPERADMIN: RoleId = "superadmin";

/** Superadmin selalu ada di setiap izin; matriks di halaman Pengguna tidak bisa mencabutnya. */
export const PERMISSIONS: Record<Permission, { label: string; roles: RoleId[] }> = {
  "schedule.edit": { label: "Menambah dan mengubah target serta jadwal produksi", roles: ["superadmin", "planner"] },
  "rules.edit": { label: "Mengatur durasi changeover dan CIP sesuai standar", roles: ["superadmin", "planner"] },
  "plan.simulate": { label: "Mengubah parameter simulasi, waktu maintenance, dan kapasitas alat", roles: ["superadmin", "planner"] },
  "arrival.edit": { label: "Menambah dan mengubah jadwal kedatangan RT, estimasi tiba, dan status perjalanan", roles: ["superadmin", "receiving"] },
  "queue.record": { label: "Mencatat kedatangan aktual, waktu awal umur susu, dan proses bongkar", roles: ["superadmin", "receiving"] },
  "transfer.record": { label: "Mencatat transfer susu dari RT ke tangki penerimaan", roles: ["superadmin", "receiving"] },
  "lab.record": { label: "Memasukkan dan memperbarui hasil pemeriksaan lab", roles: ["superadmin", "lab"] },
  "production.record": { label: "Mencatat produksi mulai, selesai, dan hasil di lini yang ditugaskan", roles: ["superadmin", "operator"] },
  "equipment.update": { label: "Memperbarui kondisi mesin dan mencatat downtime", roles: ["superadmin", "operator"] },
  "process.transfer": { label: "Mencatat volume perpindahan bahan pada alat yang ditugaskan", roles: ["superadmin", "operator"] },
  "qc.record": { label: "Mencatat hasil pemeriksaan mutu barang jadi", roles: ["superadmin", "qa"] },
  "quality.rules": { label: "Mengatur batas holding time dan ketentuan mutu", roles: ["superadmin", "qa"] },
  "demand.send": { label: "Mengirim kebutuhan susu ke farm", roles: ["superadmin", "planner"] },
  "plan.decide": { label: "Menyetujui atau menolak rekomendasi rencana", roles: ["superadmin", "planner"] },
  "constraint.edit": { label: "Mengubah batas constraint", roles: ["superadmin", "planner"] },
  "instruction.ack": { label: "Mengonfirmasi instruksi dari rencana yang disetujui", roles: ["superadmin", "receiving", "operator"] },
  "hold.submit": { label: "Mengajukan daftar hold dari hasil trace", roles: ["superadmin", "qa"] },
  "hold.review": { label: "Menyetujui, menolak, atau melepas hold", roles: ["superadmin", "qa"] },
  "lab.decide": { label: "Merilis atau menolak hasil lab penerimaan RT", roles: ["superadmin", "qa"] },
  "users.manage": { label: "Mengelola pengguna dan hak akses peran", roles: ["superadmin"] },
  "master.manage": { label: "Mengelola master data", roles: ["superadmin"] },
  "integration.manage": { label: "Mengelola konfigurasi integrasi sumber data", roles: ["superadmin"] },
  "audit.view": { label: "Melihat riwayat seluruh perubahan dan persetujuan", roles: ["superadmin", "planner", "receiving", "operator", "lab", "qa"] },
};
/** Izin yang hanya boleh dipegang Superadmin, supaya tidak ada yang mengunci dirinya keluar dari pengelolaan akses. */
export const LOCKED: Permission[] = ["users.manage"];

export type AccessMap = Partial<Record<Permission, RoleId[]>>;
let access: AccessMap = {};
/** Dipanggil state demo setiap kali Superadmin mengubah matriks hak akses. */
export const setAccess = (next: AccessMap | undefined) => { access = next ?? {}; };
export const rolesFor = (permission: Permission): RoleId[] => {
  const roles = access[permission] ?? PERMISSIONS[permission].roles;
  return roles.includes(SUPERADMIN) ? roles : [SUPERADMIN, ...roles];
};
export const can = (role: RoleId, permission: Permission) => role === SUPERADMIN || rolesFor(permission).includes(role);
/** Kalimat untuk tombol yang dinonaktifkan karena peran. */
export const whoCan = (permission: Permission) => `Hanya ${rolesFor(permission).map(r => ROLES[r].label).join(" atau ")} yang dapat melakukan ini.`;

/** Halaman yang disembunyikan per peran (menu dan akses langsung lewat URL). Superadmin melihat semuanya. */
export const HIDDEN_PAGES: Partial<Record<RoleId, string[]>> = {
  planner: ["/qc-produk", "/master-data", "/sumber-data", "/pengguna"],
  receiving: [
    "/simulasi", "/alur", "/qc-produk", "/master-data",
    "/penjadwalan", "/aturan-produksi", "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna",
  ],
  operator: [
    "/kedatangan", "/receiving", "/lab", "/qc-produk", "/master-data",
    "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna",
  ],
  qa: [
    "/simulasi", "/kedatangan", "/receiving", "/alur", "/kondisi-alat", "/master-data",
    "/penjadwalan", "/rencana/alur", "/rencana/upgrade", "/rencana", "/sumber-data", "/pengguna",
  ],
  lab: [
    "/simulasi", "/kedatangan", "/transfer", "/alur", "/kondisi-alat", "/qc-produk", "/master-data",
    "/penjadwalan", "/aturan-produksi", "/rencana/alur", "/rencana/upgrade", "/rencana",
    "/riwayat-produksi", "/graph", "/hold", "/sumber-data", "/pengguna",
  ],
};
export const canSee = (role: RoleId, href: string) => !HIDDEN_PAGES[role]?.includes(href);
/** Riwayat Persetujuan terbuka bagi semua peran yang punya izin audit.view, meski menu induknya (Rencana) disembunyikan. */
export const canOpen = (role: RoleId, pathname: string, tabHref: string) => pathname === "/persetujuan" ? can(role, "audit.view") : canSee(role, tabHref);
