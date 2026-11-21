import { Lab } from "@/components/lab/lab";

/** `?sampel=LAB-...` dari Antrean Truk langsung membuka sampel itu. */
export default async function Page({ searchParams }: { searchParams: Promise<{ sampel?: string }> }) {
  const { sampel } = await searchParams;
  return <Lab kind="penerimaan" sample={sampel} />;
}
