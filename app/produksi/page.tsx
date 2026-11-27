import { connection } from "next/server";
import { ProductionPage } from "@/components/produksi/production-page";
import { dateInWib } from "@/lib/production-date";

export const metadata = { title: "Produksi | MilkGraph" };

export default async function Page() {
  await connection();
  return <ProductionPage initialDate={dateInWib()} />;
}
