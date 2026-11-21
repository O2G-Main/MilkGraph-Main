"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LIMITS, SOP_CHANGEOVER, setProductionRules, type Limits } from "@/lib/rules";
import { CIP_STANDARD, PAPER_STANDARD, type CipGroup, type ProductionRules, type ScheduleItem } from "@/lib/production";
import { ARRIVAL_STATUS, clock, type Arrival, type ReceivingState, type RtRecord, type Transfer } from "@/lib/receiving";
import { BATCH_SAMPLES, DEFAULT_QUALITY, type LabState, type QualitySpec } from "@/lib/lab";
import { MACHINE_STATE, type Downtime, type MachineState, type OperationState, type ProcessTransfer, type Run } from "@/lib/operation";
import type { LabParam, LabResult } from "@/mock/ops";
import type { Adjustments } from "@/components/rencana/adjust";
import { BUILTIN_IDS, ROLES, PERMISSIONS, roleLabel, rolesFor, setAccess, setMenus, setRoles, type AccessMap, type CustomRole, type MenuMap, type Permission, type RoleId } from "@/lib/roles";
import type { Lot } from "@/mock/types";
import { API_MODE } from "@/lib/api/client";
import { apiGet } from "@/lib/api/client";
import { createActions } from "@/lib/api/actions";
import { mapApiState } from "@/lib/api/demo-state";
import { invalidateResources, onApiEvent, setActiveRole, startEventStream } from "@/lib/api/resource";

export type LogKind = "rencana" | "jadwal" | "aturan" | "penerimaan" | "uji" | "produksi" | "hold" | "lab" | "constraint" | "instruksi" | "akses";
export interface LogEntry { id: number; kind: LogKind; title: string; detail: string; note: string; by: string; role: string; at: string; tone: "ok" | "warn" | "crit" | "neutral" }
/** adjust: pengaturan alat (mis. upgrade UHT-2) yang ikut dihitung saat keputusan diambil. */
export interface PlanDecision { plan: string; status: "approved" | "rejected"; note: string; by: string; at: string; adjust?: string }
export type HoldStatus = "diajukan" | "aktif" | "ditolak" | "dilepas";
export interface Hold { id: string; trigger: string; rt: string; lots: Lot[]; note: string; status: HoldStatus; by: string; at: string; review?: { note: string; by: string; at: string } }
export interface LabDecision { status: "dirilis" | "ditolak"; note: string; by: string; at: string }
/** `assets`: alat yang ditugaskan ke pengguna (Operator); kosong berarti tidak dibatasi. */
export interface DemoUser { id: string; name: string; role: RoleId; active: boolean; assets?: string[] }
/** Usulan hasil simulasi Supervisor/Manager untuk Planner: batas constraint baru atau pengaturan alat di rencana. */
export interface Proposal {
  id: string; kind: "batas" | "alat"; title: string; detail: string; note: string;
  limits?: Limits; adjust?: Adjustments;
  by: string; at: string; status: "diajukan" | "diterapkan" | "ditolak";
  review?: { note: string; by: string; at: string };
}
export interface DemoState { v: 1; started: number; role: RoleId; decisions: PlanDecision[]; holds: Hold[]; labs: Record<string, LabDecision>; acks: string[]; limits: Limits; log: LogEntry[]; users: DemoUser[]; access: AccessMap; account: string | null; schedule: ScheduleItem[]; rules: ProductionRules; receiving: ReceivingState; lab: LabState; operation: OperationState; quality: QualitySpec; proposals: Proposal[]; roles: CustomRole[]; menus: MenuMap }

const KEY = "milkgraph-demo-v1";
const ROLE_KEY = "milkgraph-api-role";
const ACCOUNT_KEY = "milkgraph-account";
/** Id akun lama dari sebelum peran diganti nama. */
const RENAMED: Record<string, string> = { "USR-supervisor": "USR-operator" };
const readAccount = () => { try { const a = localStorage.getItem(ACCOUNT_KEY); return a ? RENAMED[a] ?? a : null; } catch { return null; } };
/** Lini fokus skenario (F1, F2, F4) beserta tangki aseptik dan sterilizer yang memasoknya. */
export const OPERATOR_ASSETS = ["F1", "F2", "F4", "AT-1", "AT-2", "UHT-1", "UHT-2"];
const USERS: DemoUser[] = BUILTIN_IDS.map(id => ({ id: `USR-${id}`, name: ROLES[id].user, role: id, active: true, ...(id === "operator" ? { assets: OPERATOR_ASSETS } : {}) }));
/** Jadwal shift awal [simulasi]: F5 sengaja melebihi kapasitas karena baru jalan setelah UHT-3 CIP. */
const SCHEDULE: ScheduleItem[] = [
  { id: "JDW-01", line: "F1", sku: "UHT Full Cream 1 L", packs: 12_000, start: "14:00", end: "16:00" },
  { id: "JDW-02", line: "F1", sku: "UHT Cokelat 200 ml", packs: 33_000, start: "16:35", end: "22:00" },
  { id: "JDW-03", line: "F2", sku: "UHT Stroberi 200 ml", packs: 240_000, start: "14:00", end: "22:00" },
  { id: "JDW-04", line: "F4", sku: "UHT Stroberi Kids 105 ml", packs: 135_000, start: "14:00", end: "22:00" },
  { id: "JDW-05", line: "F5", sku: "UHT Cokelat 200 ml", packs: 230_000, start: "15:10", end: "22:00" },
  { id: "JDW-06", line: "F7", sku: "UHT Low Fat 1 L", packs: 48_000, start: "14:00", end: "22:00" },
  { id: "JDW-07", line: "F8", sku: "UHT Low Fat 250 ml", packs: 160_000, start: "15:05", end: "22:00" },
];
export const DEFAULT_RULES: ProductionRules = {
  changeover: { ...SOP_CHANGEOVER }, paper: PAPER_STANDARD,
  cip: Object.fromEntries(Object.entries(CIP_STANDARD).map(([k, v]) => [k, v.minutes])) as Record<CipGroup, number>,
};
/** Penerimaan [simulasi]: 4 RT dalam perjalanan (tiba 15.05 - 16.20) dan 3 RT masih loading, sama dengan alur penerimaan. */
const RECEIVING: ReceivingState = {
  arrivals: [
    { id: "RT-31", farm: "KUD Ngantang", volume: 10_800, depart: "13:25", target: "15:00", eta: "15:05", milkStart: "07:40", status: "perjalanan", note: "" },
    { id: "RT-32", farm: "Farm Sumberejo", volume: 9_700, depart: "13:50", target: "15:30", eta: "15:30", milkStart: "08:30", status: "perjalanan", note: "" },
    { id: "RT-33", farm: "Farm Tutur", volume: 9_400, depart: "14:15", target: "15:45", eta: "15:55", milkStart: "09:20", status: "perjalanan", note: "" },
    { id: "RT-34", farm: "Farm Pujon Kidul", volume: 10_200, depart: "14:30", target: "16:00", eta: "16:20", milkStart: "07:50", status: "perjalanan", note: "Alcohol test positif 9 Okt, sampling diperketat" },
    { id: "RT-35", farm: "Farm Ngadirejo", volume: 8_900, depart: "15:40", target: "17:10", eta: "17:10", milkStart: "10:30", status: "loading", note: "" },
    { id: "RT-36", farm: "KUD Ngantang", volume: 11_000, depart: "16:05", target: "17:45", eta: "17:45", milkStart: "11:15", status: "loading", note: "" },
    { id: "RT-37", farm: "Farm Sumberejo", volume: 9_800, depart: "16:40", target: "18:20", eta: "18:20", milkStart: "12:00", status: "loading", note: "" },
  ],
  records: {},
  transfers: [
    { id: "TRF-01", rt: "RT-21", tank: "RMT-2", volume: 10_400, out: 10_450, start: "13:20", end: "13:50", measuredAt: "13:50", counted: true, by: "Dimas Prasetyo" },
    { id: "TRF-02", rt: "RT-22", tank: "RMT-1", volume: 9_800, out: 9_800, start: "13:55", end: "14:25", measuredAt: "14:25", counted: true, by: "Dimas Prasetyo" },
  ],
};
/** Lantai produksi [simulasi]: F1, F2, F4, F7 sudah jalan sejak 14.00; F10 breakdown dan F8 ganti format tercatat sebagai downtime. */
const OPERATION: OperationState = {
  runs: { "JDW-01": { start: "14:00" }, "JDW-03": { start: "14:00" }, "JDW-04": { start: "14:00" }, "JDW-06": { start: "14:00" } },
  machines: {},
  downtime: [
    { id: "DT-01", asset: "F10", cause: "Breakdown", start: "13:50", note: "Seal jaw rusak, tiket MT-2231" },
    { id: "DT-02", asset: "F8", cause: "Ganti format", start: "14:20", note: "Ganti format 1 L ke 250 ml" },
  ],
  transfers: [
    { id: "PRS-01", from: "UHT-2", to: "AT-2", volume: 6_990, received: 6_950, start: "13:00", end: "14:00", measuredAt: "14:00", batch: "MXB-1014-02", by: "Hendra Kusuma" },
    { id: "PRS-02", from: "AT-1", to: "F1", volume: 6_550, received: 6_550, start: "13:30", end: "14:30", measuredAt: "14:30", by: "Hendra Kusuma" },
  ],
};
const applyRules = (rules: ProductionRules) => setProductionRules({ changeover: rules.changeover, bayCip: rules.cip.bay });
const initial = (started = 0): DemoState => ({ v: 1, started, role: "planner", decisions: [], holds: [], labs: {}, acks: [], limits: DEFAULT_LIMITS, log: [], users: USERS, access: {}, account: null, schedule: SCHEDULE, rules: DEFAULT_RULES, receiving: RECEIVING, lab: { entries: {}, samples: BATCH_SAMPLES }, operation: OPERATION, quality: DEFAULT_QUALITY, proposals: [], roles: [], menus: {} });
const SERVER = initial();
let state = SERVER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return state;
  loaded = true;
  if (API_MODE) {
    try {
      const role = sessionStorage.getItem(ROLE_KEY);
      if (role && role in ROLES) state = { ...state, role: role as RoleId };
    } catch { /* private mode */ }
    setActiveRole(state.role);
    state = { ...state, account: readAccount() };
    return state;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as DemoState | null;
    state = saved?.v === 1 ? { ...initial(saved.started), ...saved, limits: { ...DEFAULT_LIMITS, ...saved.limits } } : initial(Date.now());
    // Peran buatan Superadmin harus terdaftar dulu supaya tidak dianggap peran lama yang tidak dikenal.
    setRoles(state.roles);
    // Peran "supervisor" lama sekarang "operator"; peran lain yang tidak dikenal jatuh ke Planner. Id "qa" kini milik QA/QC.
    const fix = (r: string) => (r in ROLES ? r : r === "supervisor" ? "operator" : "planner") as RoleId;
    state = { ...state, role: fix(state.role), users: state.users.map(u => ({ ...u, role: fix(u.role), ...(RENAMED[u.id] ? { id: RENAMED[u.id] } : {}), ...(fix(u.role) === "operator" && !u.assets ? { assets: OPERATOR_ASSETS } : {}) })),
      access: Object.fromEntries(Object.entries(state.access).map(([k, v]) => [k, (v ?? []).map(fix)])) };
  } catch { state = initial(Date.now()); }
  // Peran baru (mis. QA/QC) mendapat pengguna demo bila belum ada di data lama.
  state = { ...state, users: [...state.users, ...USERS.filter(u => !state.users.some(x => x.id === u.id))] };
  // Jadwal lama belum punya target tiba: ambil dari seed, atau samakan dengan estimasi.
  const seedTarget = (id: string) => RECEIVING.arrivals.find(a => a.id === id)?.target;
  state = { ...state, receiving: { ...state.receiving, arrivals: state.receiving.arrivals.map(a => (a.target ? a : { ...a, target: seedTarget(a.id) ?? a.eta })) } };
  state = { ...state, account: readAccount() };
  setRoles(state.roles);
  setMenus(state.menus);
  setAccess(state.access);
  applyRules(state.rules);
  return state;
}
function save(next: DemoState) {
  state = next;
  try { if (next.account) localStorage.setItem(ACCOUNT_KEY, next.account); else localStorage.removeItem(ACCOUNT_KEY); } catch { /* mode privat */ }
  setRoles(next.roles);
  setMenus(next.menus);
  setAccess(next.access);
  applyRules(next.rules);
  if (!API_MODE) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* mode privat: demo tetap jalan tanpa simpan */ }
  }
  listeners.forEach(fn => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const actions = createActions(() => load().role);
let loadingApi = false;
export let apiStateError: Error | null = null;
if (API_MODE) {
  onApiEvent(() => { void refreshApiState(); });
}

export async function refreshApiState() {
  if (!API_MODE || loadingApi) return;
  loadingApi = true;
  try {
    const role = load().role;
    const [session, decisions, holds, labs, instructions, limits, audit] = await Promise.all([
      apiGet<{ role: RoleId }>("/session", role),
      apiGet<PlanDecision[]>("/decisions", role),
      apiGet<Hold[]>("/holds", role),
      apiGet<{ id: string; decision?: LabDecision }[]>("/lab/results", role),
      apiGet<{ id: string; ackedBy?: string }[]>("/plans/current/instructions", role),
      apiGet<Limits>("/limits", role),
      apiGet<LogEntry[]>("/audit", role),
    ]);
    save({ ...mapApiState({ role: session.role, decisions, holds, labs, instructions, limits, audit }), users: state.users, access: state.access, account: state.account, schedule: state.schedule, rules: state.rules, receiving: state.receiving, lab: state.lab, operation: state.operation, quality: state.quality, proposals: state.proposals, roles: state.roles, menus: state.menus });
    apiStateError = null;
  } catch (error) {
    apiStateError = error instanceof Error ? error : new Error(String(error));
    listeners.forEach(fn => fn());
  } finally { loadingApi = false; }
}

/** State demo bersama semua halaman, tersimpan di browser. Render server memakai state awal. */
export const useDemo = () => {
  const result = useSyncExternalStore(subscribe, load, () => SERVER);
  useEffect(() => {
    if (API_MODE) {
      void refreshApiState();
      startEventStream();
    }
  }, []);
  return result;
};

/** Jam demo: snapshot 14.42 ditambah menit sungguhan sejak demo dimulai, supaya urutan log masuk akal. */
export function demoClock(s: DemoState = load()) {
  const minutes = 14 * 60 + 42 + Math.max(1, Math.ceil((Date.now() - (s.started || Date.now())) / 60000));
  return `${Math.floor(minutes / 60)}.${String(minutes % 60).padStart(2, "0")}`;
}
/** Nama pelaku dari akun yang sedang masuk; peran buatan Superadmin tidak punya nama bawaan. */
const who = (s: DemoState) => s.users.find(u => u.id === s.account)?.name ?? ROLES[s.role]?.user ?? roleLabel(s.role);
export const actor = (s: DemoState) => ({ by: who(s), role: roleLabel(s.role) });

/** Ubah state dan catat satu baris audit sekaligus. */
function act(change: (s: DemoState, at: string) => Partial<DemoState>, entry?: Omit<LogEntry, "id" | "by" | "role" | "at">) {
  const s = load();
  const at = demoClock(s);
  const next = { ...s, ...change(s, at) };
  if (entry) next.log = [{ ...entry, ...actor(s), at, id: Date.now() }, ...next.log];
  save(next);
}

export const setRole = async (role: RoleId) => {
  if (API_MODE) {
    try { sessionStorage.setItem(ROLE_KEY, role); } catch { /* private mode */ }
    setActiveRole(role);
    state = { ...state, role };
    save(state);
    await actions.setRole(role);
    await refreshApiState();
    invalidateResources();
    return;
  }
  act(() => ({ role }));
};

export const resetDemo = async () => {
  if (API_MODE) {
    await actions.resetDemo();
    await refreshApiState();
    invalidateResources();
    return;
  }
  const { account, role } = load();
  save({ ...initial(Date.now()), account, role });
};

export const decidePlan = async (plan: string, label: string, status: PlanDecision["status"], note: string, adjust?: string) => {
  if (API_MODE) {
    const res = await actions.decidePlan(plan, status, adjust ? `${note}${note ? " " : ""}[Pengaturan alat: ${adjust}]` : note);
    await refreshApiState();
    invalidateResources(["/decisions", "/plans", "/site/status", "/site/bottlenecks", "/receiving", "/audit", "/notifications"]);
    return res;
  }
  act(
    (s, at) => ({ decisions: [{ plan, status, note, by: who(s), at, ...(adjust ? { adjust } : {}) }, ...s.decisions.filter(d => d.plan !== plan)] }),
    { kind: "rencana", title: `Rekomendasi ${status === "approved" ? "disetujui" : "ditolak"}`, detail: adjust ? `${label}, dengan ${adjust}` : label, note, tone: status === "approved" ? "ok" : "warn" },
  );
};

export const submitHold = async (hold: Pick<Hold, "trigger" | "rt" | "lots" | "note">) => {
  if (API_MODE) {
    const res = await actions.submitHold(hold);
    await refreshApiState();
    invalidateResources(["/holds", "/audit", "/notifications"]);
    return res;
  }
  act(
    (s, at) => ({ holds: [{ ...hold, id: `HOLD-${String(s.holds.length + 1).padStart(3, "0")}`, status: "diajukan", by: who(s), at }, ...s.holds] }),
    { kind: "hold", title: "Daftar hold diajukan ke QA", detail: `${hold.lots.length} lot dari ${hold.rt}, pemicu ${hold.trigger}`, note: hold.note, tone: "warn" },
  );
};

const HOLD_TITLE: Record<Exclude<HoldStatus, "diajukan">, string> = { aktif: "Hold disetujui QA", ditolak: "Pengajuan hold ditolak", dilepas: "Hold dilepas" };
export const reviewHold = async (id: string, status: Exclude<HoldStatus, "diajukan">, note: string) => {
  if (API_MODE) {
    const res = await actions.reviewHold(id, status, note);
    await refreshApiState();
    invalidateResources(["/holds", "/audit", "/notifications"]);
    return res;
  }
  act(
    (s, at) => ({ holds: s.holds.map(h => h.id === id ? { ...h, status, review: { note, by: who(s), at } } : h) }),
    { kind: "hold", title: HOLD_TITLE[status], detail: id, note, tone: status === "aktif" ? "crit" : status === "dilepas" ? "ok" : "neutral" },
  );
};

export const decideLab = async (id: string, rt: string, status: LabDecision["status"], note: string) => {
  if (API_MODE) {
    const res = await actions.decideLab(id, status, note);
    await refreshApiState();
    invalidateResources(["/lab/results", "/lab/summary", "/receiving", "/site/status", "/audit"]);
    return res;
  }
  act(
    (s, at) => ({ labs: { ...s.labs, [id]: { status, note, by: who(s), at } } }),
    { kind: "lab", title: `Hasil lab ${rt} ${status}`, detail: id, note, tone: status === "dirilis" ? "ok" : "crit" },
  );
};

export const acknowledge = async (id: string, title: string) => {
  if (API_MODE) {
    const res = await actions.acknowledge(id);
    await refreshApiState();
    invalidateResources(["/plans", "/audit"]);
    return res;
  }
  act(
    s => ({ acks: [...s.acks, id] }),
    { kind: "instruksi", title: "Instruksi dikonfirmasi", detail: title, note: "", tone: "ok" },
  );
};

export const setLimits = async (limits: Limits, detail: string) => {
  if (API_MODE) {
    const res = await actions.setLimits(limits);
    await refreshApiState();
    invalidateResources(["/limits", "/plans", "/receiving", "/notifications", "/audit"]);
    return res;
  }
  act(() => ({ limits }), { kind: "constraint", title: "Batas constraint diubah", detail, note: "", tone: "neutral" });
};

export const sendDemand = async (detail: string) => {
  if (API_MODE) {
    const res = await actions.sendDemand();
    await refreshApiState();
    invalidateResources(["/supply/demand-sends", "/audit"]);
    return res;
  }
  act(() => ({}), { kind: "rencana", title: "Kebutuhan susu dikirim ke farm", detail, note: "", tone: "ok" });
};

/** Pengelolaan pengguna dan hak akses (Superadmin). Mode API belum punya endpoint-nya, jadi hanya tersimpan di browser. */
export const addUser = (name: string, role: RoleId) => act(
  s => ({ users: [...s.users, { id: `USR-${Date.now()}`, name, role, active: true }] }),
  { kind: "akses", title: "Pengguna ditambahkan", detail: `${name} sebagai ${roleLabel(role)}`, note: "", tone: "ok" },
);
export const updateUser = (id: string, change: Partial<Pick<DemoUser, "role" | "active" | "assets">>) => {
  const user = load().users.find(u => u.id === id);
  if (!user) return;
  const detail = change.assets ? `${user.name}: alat/lini ${change.assets.join(", ") || "tidak ada"}` : change.role ? `${user.name}: ${roleLabel(user.role)} jadi ${roleLabel(change.role)}` : `${user.name} ${change.active ? "diaktifkan kembali" : "dinonaktifkan"}`;
  act(
    s => ({ users: s.users.map(u => u.id === id ? { ...u, ...change } : u) }),
    { kind: "akses", title: change.assets ? "Penugasan alat diubah" : change.role ? "Peran pengguna diubah" : change.active ? "Pengguna diaktifkan" : "Pengguna dinonaktifkan", detail, note: "", tone: change.active === false ? "warn" : "neutral" },
  );
};
export const togglePermission = (permission: Permission, role: RoleId) => {
  const has = rolesFor(permission).includes(role);
  act(
    s => ({ access: { ...s.access, [permission]: has ? rolesFor(permission).filter(r => r !== role) : [...rolesFor(permission), role] } }),
    { kind: "akses", title: has ? "Hak akses dicabut" : "Hak akses diberikan", detail: `${roleLabel(role)}: ${PERMISSIONS[permission].label.toLowerCase()}`, note: "", tone: has ? "warn" : "ok" },
  );
};

/** Login demo: email memilih akun, kata sandi mengikuti peran. Belum ada autentikasi sungguhan. */
export const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".")}@milkgraph.id`;
export const demoPassword = (role: RoleId) => `MilkGraph-${role}-2026`;
export const initialsOf = (name: string) => name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
export const isSignedIn = () => {
  const s = load();
  return s.users.some(u => u.id === s.account && u.active);
};
export const login = async (userId: string, password: string) => {
  const user = load().users.find(u => u.id === userId && u.active);
  if (!user || password !== demoPassword(user.role)) throw new Error("Email atau kata sandi tidak cocok.");
  await setRole(user.role);
  save({ ...load(), account: user.id });
};
export const logout = () => save({ ...load(), account: null });

/** Penjadwalan dan Aturan Produksi (Planner). Tersimpan di browser; mode API belum punya endpoint-nya. */
const shiftText = (i: Pick<ScheduleItem, "line" | "sku" | "packs" | "start" | "end">) => `${i.line}, ${i.sku}, ${new Intl.NumberFormat("id-ID").format(i.packs)} pak, ${i.start.replace(":", ".")}-${i.end.replace(":", ".")}`;
export const saveScheduleItem = (item: Omit<ScheduleItem, "id"> & { id?: string }) => {
  const isNew = !item.id;
  const id = item.id ?? `JDW-${String(Date.now()).slice(-5)}`;
  act(
    s => ({ schedule: isNew ? [...s.schedule, { ...item, id }] : s.schedule.map(x => x.id === id ? { ...item, id } : x) }),
    { kind: "jadwal", title: isNew ? "Jadwal produksi ditambahkan" : "Jadwal produksi diubah", detail: shiftText(item), note: "", tone: "neutral" },
  );
};
export const removeScheduleItem = (id: string) => {
  const item = load().schedule.find(x => x.id === id);
  if (!item) return;
  act(
    s => ({ schedule: s.schedule.filter(x => x.id !== id) }),
    { kind: "jadwal", title: "Jadwal produksi dihapus", detail: shiftText(item), note: "", tone: "warn" },
  );
};
export const setChangeoverRule = (key: string, minutes: number) => act(
  s => ({ rules: { ...s.rules, changeover: { ...s.rules.changeover, [key]: minutes } } }),
  { kind: "aturan", title: "Durasi changeover diubah", detail: `${key.replace(">", " ke ")}: ${minutes} menit`, note: "", tone: "neutral" },
);
export const setPaperRule = (minutes: number) => act(
  s => ({ rules: { ...s.rules, paper: minutes } }),
  { kind: "aturan", title: "Durasi ganti roll kemasan diubah", detail: `${minutes} menit`, note: "", tone: "neutral" },
);
export const setCipRule = (group: CipGroup, minutes: number) => act(
  s => ({ rules: { ...s.rules, cip: { ...s.rules.cip, [group]: minutes } } }),
  { kind: "aturan", title: "Durasi CIP diubah", detail: `${CIP_STANDARD[group].label}: ${minutes} menit`, note: "", tone: "neutral" },
);

/** Penerimaan (Koordinator receiving). Tersimpan di browser; mode API belum punya endpoint-nya. */
const recv = (s: DemoState, patch: Partial<ReceivingState>) => ({ receiving: { ...s.receiving, ...patch } });
const num = (n: number) => new Intl.NumberFormat("id-ID").format(n);
export const saveArrival = (item: Arrival, isNew: boolean) => act(
  s => recv(s, { arrivals: isNew ? [...s.receiving.arrivals, item] : s.receiving.arrivals.map(a => a.id === item.id ? item : a) }),
  { kind: "penerimaan", title: isNew ? "Jadwal kedatangan RT ditambahkan" : "Jadwal kedatangan RT diubah", detail: `${item.id} dari ${item.farm}, ${num(item.volume)} L, ETA ${clock(item.eta)}, ${ARRIVAL_STATUS[item.status].label.toLowerCase()}`, note: item.note, tone: item.status === "batal" ? "warn" : "neutral" },
);
/** Kedatangan aktual: RT berpindah dari jadwal ke antrean truk. */
export const recordArrival = (id: string, record: Pick<RtRecord, "arrivedAt" | "milkStart" | "volume" | "temperature">) => act(
  s => recv(s, { arrivals: s.receiving.arrivals.map(a => a.id === id ? { ...a, status: "tiba" } : a), records: { ...s.receiving.records, [id]: { ...s.receiving.records[id], ...record } } }),
  { kind: "penerimaan", title: "Kedatangan RT dicatat", detail: `${id} tiba pukul ${clock(record.arrivedAt ?? "")}, awal umur susu ${clock(record.milkStart ?? "")}${record.volume ? `, ${num(record.volume)} L` : ""}`, note: "", tone: "ok" },
);
export const updateRtRecord = (id: string, patch: RtRecord, title: string, detail: string) => act(
  s => recv(s, { records: { ...s.receiving.records, [id]: { ...s.receiving.records[id], ...patch } } }),
  { kind: "penerimaan", title, detail: `${id}, ${detail}`, note: "", tone: "neutral" },
);
export const addTransfer = (t: Omit<Transfer, "id" | "counted">) => act(
  s => recv(s, { transfers: [...s.receiving.transfers, { ...t, id: `TRF-${String(s.receiving.transfers.length + 1).padStart(2, "0")}`, counted: false }] }),
  { kind: "penerimaan", title: "Transfer susu dicatat", detail: `${t.rt} ke ${t.tank}, ${num(t.volume)} L, ${clock(t.start)}-${clock(t.end)}`, note: "", tone: "ok" },
);

/** Lab: memasukkan hasil uji per sampel. Tersimpan di browser; mode API belum punya endpoint-nya. */
export const saveLabEntry = (sample: Pick<LabResult, "id" | "subject">, params: LabParam[], retest: boolean) => act(
  (s, at) => ({ lab: { ...s.lab, entries: { ...s.lab.entries, [sample.id]: { params, retest, by: who(s), at } } } }),
  {
    kind: "uji", title: params.some(p => p.ok === false) ? "Hasil uji out-of-spec" : retest ? "Uji ulang ditandai" : params.some(p => p.ok === null) ? "Hasil uji diperbarui" : "Hasil uji lengkap",
    detail: `${sample.subject} (${sample.id}): ${params.filter(p => p.ok !== null).length} dari ${params.length} parameter selesai${params.some(p => p.ok === false) ? `, gagal: ${params.filter(p => p.ok === false).map(p => p.name).join(", ")}` : ""}`,
    note: "", tone: params.some(p => p.ok === false) ? "crit" : retest ? "warn" : "neutral",
  },
);
export const addLabSample = (sample: LabResult) => act(
  s => ({ lab: { ...s.lab, samples: [...s.lab.samples, sample] } }),
  { kind: "uji", title: "Sampel baru dibuat", detail: `${sample.subject} (${sample.id}), diambil ${sample.sampled}`, note: "", tone: "neutral" },
);

/** Operator produksi. Tersimpan di browser; mode API belum punya endpoint-nya. */
const op = (s: DemoState, patch: Partial<OperationState>) => ({ operation: { ...s.operation, ...patch } });
/** Alat yang ditugaskan ke akun yang sedang masuk; undefined berarti tidak dibatasi. */
export const assignedAssets = (s: DemoState) => s.role === "superadmin" ? undefined : s.users.find(u => u.id === s.account)?.assets;
export const recordRun = (order: Pick<ScheduleItem, "id" | "line" | "sku">, patch: Run, title: string, detail: string) => act(
  s => op(s, { runs: { ...s.operation.runs, [order.id]: { ...s.operation.runs[order.id], ...patch, by: who(s) } } }),
  { kind: "produksi", title, detail: `${order.line} ${order.sku}, ${detail}`, note: "", tone: "neutral" },
);
export const updateMachine = (asset: string, state: MachineState, note: string) => act(
  (s, at) => op(s, { machines: { ...s.operation.machines, [asset]: { state, note, at, by: who(s) } } }),
  { kind: "produksi", title: "Kondisi mesin diperbarui", detail: `${asset}: ${MACHINE_STATE[state].label}`, note, tone: MACHINE_STATE[state].tone },
);
export const saveDowntime = (d: Omit<Downtime, "id"> & { id?: string }) => act(
  s => op(s, { downtime: d.id ? s.operation.downtime.map(x => x.id === d.id ? { ...x, ...d, id: x.id } : x) : [...s.operation.downtime, { ...d, id: `DT-${String(s.operation.downtime.length + 1).padStart(2, "0")}` }] }),
  { kind: "produksi", title: d.id ? (d.end ? "Downtime selesai" : "Downtime diubah") : "Downtime dicatat", detail: `${d.asset}, ${d.cause}, ${clock(d.start)}${d.end ? `-${clock(d.end)}` : " sampai sekarang"}`, note: d.note, tone: d.end ? "ok" : "warn" },
);
export const addProcessTransfer = (t: Omit<ProcessTransfer, "id" | "by">) => act(
  s => op(s, { transfers: [...s.operation.transfers, { ...t, id: `PRS-${String(s.operation.transfers.length + 1).padStart(2, "0")}`, by: who(s) }] }),
  { kind: "produksi", title: "Transfer bahan dicatat", detail: `${t.from} ke ${t.to}, ${new Intl.NumberFormat("id-ID").format(t.volume)} L, ${clock(t.start)}-${clock(t.end)}`, note: "", tone: "ok" },
);

/** QA/QC: ketentuan mutu susu segar. Tersimpan di browser; mode API belum punya endpoint-nya. */
export const setQuality = (q: QualitySpec, detail: string) => act(
  () => ({ quality: q }),
  { kind: "aturan", title: "Ketentuan mutu diubah", detail, note: "", tone: "neutral" },
);

/** Supervisor/Manager mengajukan hasil simulasi; Planner menerapkan atau menolaknya. Tersimpan di browser. */
export const submitProposal = (p: Pick<Proposal, "kind" | "title" | "detail" | "note" | "limits" | "adjust">) => act(
  (s, at) => ({ proposals: [{ ...p, id: `USL-${String(s.proposals.length + 1).padStart(2, "0")}`, by: who(s), at, status: "diajukan" }, ...s.proposals] }),
  { kind: "rencana", title: "Usulan simulasi diajukan ke Planner", detail: `${p.title}: ${p.detail}`, note: p.note, tone: "warn" },
);
/** Menerapkan usulan batas langsung mengganti batas yang berlaku; usulan alat diterapkan ke Rencana oleh pemanggil. */
export const reviewProposal = (id: string, status: "diterapkan" | "ditolak", note: string) => {
  const p = load().proposals.find(x => x.id === id);
  if (!p) return;
  act(
    (s, at) => ({
      proposals: s.proposals.map(x => x.id === id ? { ...x, status, review: { note, by: who(s), at } } : x),
      ...(status === "diterapkan" && p.limits ? { limits: p.limits } : {}),
    }),
    { kind: "rencana", title: status === "diterapkan" ? "Usulan simulasi diterapkan" : "Usulan simulasi ditolak", detail: `${p.id} dari ${p.by}: ${p.detail}`, note, tone: status === "diterapkan" ? "ok" : "neutral" },
  );
};

/** Role & Hak Akses (Superadmin). Peran bawaan hanya bisa diganti nama dan deskripsinya; peran baru bisa dihapus selama belum dipakai. */
export const saveRole = (role: CustomRole, isNew: boolean, hidden?: string[], grants: Permission[] = []) => act(
  s => ({
    roles: [...s.roles.filter(r => r.id !== role.id), role],
    ...(hidden ? { menus: { ...s.menus, [role.id]: hidden } } : {}),
    // Izin yang disalin dari role lain saat role baru dibuat.
    ...(grants.length ? { access: { ...s.access, ...Object.fromEntries(grants.map(p => [p, [...new Set([...(s.access[p] ?? PERMISSIONS[p].roles), role.id])]])) } } : {}),
  }),
  { kind: "akses", title: isNew ? "Role baru dibuat" : "Role diubah", detail: `${role.label}: ${role.focus || "tanpa deskripsi"}`, note: "", tone: "ok" },
);
export const deleteRole = (id: RoleId) => {
  const label = roleLabel(id);
  act(
    s => {
      const menus = { ...s.menus };
      delete menus[id];
      return {
        roles: s.roles.filter(r => r.id !== id),
        menus,
        access: Object.fromEntries(Object.entries(s.access).map(([k, v]) => [k, (v ?? []).filter(r => r !== id)])) as AccessMap,
      };
    },
    { kind: "akses", title: "Role dihapus", detail: label, note: "", tone: "warn" },
  );
};
/** Atur satu menu tampil atau tidak untuk peran tertentu. */
export const setRoleMenu = (role: RoleId, href: string, visible: boolean, current: string[]) => {
  const hidden = visible ? current.filter(h => h !== href) : [...new Set([...current, href])];
  act(
    s => ({ menus: { ...s.menus, [role]: hidden } }),
    { kind: "akses", title: visible ? "Menu ditampilkan" : "Menu disembunyikan", detail: `${roleLabel(role)}: ${href}`, note: "", tone: "neutral" },
  );
};

/**
 * Satu pencatatan transfer untuk dua alat (Traceability > Transfer & Volume): volume keluar dari alat asal dan diterima alat tujuan.
 * Dari road tanker disimpan sebagai transfer penerimaan, selain itu sebagai transfer proses.
 */
export const recordTransfer = (t: { from: string; to: string; out: number; in: number; start: string; end: string; measuredAt: string; batch?: string; note?: string }) => {
  const diff = t.out - t.in;
  act(
    s => t.from.startsWith("RT-")
      ? recv(s, { transfers: [...s.receiving.transfers, { id: `TRF-${String(s.receiving.transfers.length + 1).padStart(2, "0")}`, rt: t.from, tank: t.to, volume: t.in, out: t.out, start: t.start, end: t.end, measuredAt: t.measuredAt, note: t.note, by: who(s), counted: t.measuredAt <= "14:42" }] })
      : op(s, { transfers: [...s.operation.transfers, { id: `PRS-${String(s.operation.transfers.length + 1).padStart(2, "0")}`, from: t.from, to: t.to, volume: t.out, received: t.in, start: t.start, end: t.end, measuredAt: t.measuredAt, batch: t.batch, note: t.note, by: who(s) }] }),
    { kind: t.from.startsWith("RT-") ? "penerimaan" : "produksi", title: "Transfer dicatat", detail: `${t.from} ke ${t.to}: keluar ${num(t.out)} L, diterima ${num(t.in)} L, selisih ${num(diff)} L`, note: t.note ?? "", tone: Math.abs(diff) / (t.out || 1) > 0.005 ? "warn" : "ok" },
  );
};
