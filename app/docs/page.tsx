import type { Metadata } from "next";
import { DocsPortalStandalone } from "@/components/docs/Documentation";

export const metadata: Metadata = {
  title: "Documentation | Nexio Protocol on Arc Mainnet",
  description:
    "Developer and architecture portal for Nexio Protocol on Arc Mainnet (Chain ID 5042 / 0x13b2): dual-decimal USDC state, pure two-sided market spot, automated 10 NLP / $100 / 24h vaults with on-chain claimNLP(), consecutive 3-tier Daily GM, and permanent .nex identity recovery.",
};

export default function DocsPage() {
  return <DocsPortalStandalone />;
}
