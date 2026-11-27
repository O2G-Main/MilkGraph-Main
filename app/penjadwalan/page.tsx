import { connection } from "next/server";
import { Penjadwalan } from "@/components/penjadwalan/penjadwalan";
import { dateInWib } from "@/lib/production-date";

export const metadata = { title: "Penjadwalan | MilkGraph" };

export default async function Page() {
  await connection();
  return <Penjadwalan initialDate={dateInWib()} />;
}
