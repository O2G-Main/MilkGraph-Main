import type { Metadata } from "next";
import { Login } from "@/components/login/login";
export const metadata: Metadata = { title: "Masuk | MilkGraph" };
export default function Page() { return <Login />; }
