import { MasterDirectory } from "@/components/master-data/master-directory";

export const metadata = {
  title: "Data Induk | MilkGraph",
  description: "Akses produk, alat, alur produksi, dan aturan sesuai jenis data master Greenfields.",
};

export default function MasterDataPage() {
  return <MasterDirectory />;
}
