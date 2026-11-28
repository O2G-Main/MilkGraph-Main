import Link from "next/link";
import { buttonClass } from "@/components/ui";
export default function NotFound() { return <div className="placeholder-card"><h1>Halaman tidak ditemukan</h1><p>Pilih halaman dari menu, atau kembali ke Beranda.</p><Link className={buttonClass("secondary")} href="/">Kembali ke Beranda</Link></div>; }
