import type { Metadata } from "next";
import { LocalProfileWorkspace } from "@/components/probant/local/LocalProfileWorkspace";

export const metadata: Metadata = { title: "Profil personnel local · PROBANT" };
export const dynamic = "force-dynamic";

export default function LocalProfilePage() {
  return <LocalProfileWorkspace />;
}
