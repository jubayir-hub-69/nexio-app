import type { Metadata } from "next";
import Documentation from "@/components/docs/Documentation";

export const metadata: Metadata = {
  title: "Nexio | Arc Mainnet",
  description: "Nexio documentation for Arc Mainnet, Achswap quotes, .nex names, vaults, and Daily GM tiers.",
};

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white md:px-10">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm font-bold text-cyan-300">Nexio</a>
        <div className="mt-6">
          <Documentation />
        </div>
      </div>
    </main>
  );
}
