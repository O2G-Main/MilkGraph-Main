import { Transfer } from "@/components/transfer/transfer";

/** `?alat=RMT-1` dari detail tangki langsung memfilter riwayat transfer alat itu. */
export default async function Page({ searchParams }: { searchParams: Promise<{ alat?: string }> }) {
  const { alat } = await searchParams;
  return <Transfer alat={alat} />;
}
