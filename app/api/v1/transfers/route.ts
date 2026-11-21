import { validateIngest, type IotTransfer } from "@/lib/volume";

/**
 * Data transfer/pengukuran volume dari IoT Greenfields (flowmeter, level sensor).
 * GET  /api/v1/transfers          → daftar transfer IoT, terbaru dulu (opsional ?alat=AT-2)
 * POST /api/v1/transfers          → kirim satu objek atau array (maks. 100) transfer
 * Body: { from, to, out, in, start, end, measuredAt, device, batch? } dengan jam "HH:MM" dan volume liter.
 * Auth: header `Authorization: Bearer <IOT_INGEST_KEY>` bila IOT_INGEST_KEY diisi; tanpa kunci hanya diterima di development.
 * Penyimpanan sementara di memori server sampai backend tersedia.
 */
const MAX_BATCH = 100;
const MAX_STORED = 500;

type Store = { items: IotTransfer[]; seq: number };
const g = globalThis as typeof globalThis & { __milkgraphIot?: Store };
const store: Store = g.__milkgraphIot ??= {
  seq: 1,
  // Contoh satu pengukuran flowmeter supaya tampilan IoT terlihat sebelum perangkat terhubung.
  items: [{ id: "IOT-0001", from: "ST-3", to: "MX-1", out: 14_300, in: 14_260, start: "13:40", end: "14:10", measuredAt: "14:10", device: "FM-ST3-01", batch: "MXB-1014-02", receivedAt: "14:10" }],
};

const error = (status: number, code: string, message: string, field?: string) => Response.json({ error: { code, message, ...(field ? { field } : {}) } }, { status });
const now = () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).replace(".", ":");

export function GET(request: Request) {
  const alat = new URL(request.url).searchParams.get("alat");
  const items = alat ? store.items.filter(t => t.from === alat || t.to === alat) : store.items;
  return Response.json({ items: [...items].reverse(), count: items.length });
}

export async function POST(request: Request) {
  const key = process.env.IOT_INGEST_KEY;
  if (key) {
    if (request.headers.get("authorization") !== `Bearer ${key}`) return error(401, "UNAUTHORIZED", "Kunci API IoT tidak valid.");
  } else if (process.env.NODE_ENV === "production") {
    return error(503, "NOT_CONFIGURED", "IOT_INGEST_KEY belum diatur di server.");
  }
  let body: unknown;
  try { body = await request.json(); } catch { return error(400, "BAD_JSON", "Isi permintaan bukan JSON yang valid."); }
  const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.length > MAX_BATCH) return error(400, "BAD_BATCH", `Kirim 1 sampai ${MAX_BATCH} transfer per permintaan.`);
  const accepted: IotTransfer[] = [];
  for (const [i, item] of list.entries()) {
    const v = validateIngest(item);
    if (!v.ok) return error(422, "INVALID", list.length > 1 ? `Data ke-${i + 1}: ${v.message}` : v.message, v.field);
    accepted.push({ ...v.value, id: `IOT-${String(++store.seq).padStart(4, "0")}`, receivedAt: now() });
  }
  store.items.push(...accepted);
  if (store.items.length > MAX_STORED) store.items.splice(0, store.items.length - MAX_STORED);
  return Response.json({ items: accepted }, { status: 201 });
}
