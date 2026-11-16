"use client";

import { useState } from "react";

const CHAPTERS = [
  ["start", "Start Here"],
  ["quickstart", "5-Minute Quickstart"],
  ["concepts", "Core Concepts"],
  ["achswap", "Achswap API Engine"],
  ["identity", ".nex Identity & Recovery"],
  ["vaults", "DeFi Vaults & LP Guard"],
  ["gm", "Daily GM Tier Utility"],
  ["contracts", "Smart Contracts"],
  ["specs", "Machine-Readable Specs"],
] as const;

type ChapterId = (typeof CHAPTERS)[number][0];

const CONTRACTS = [
  ["ArcNameService", "0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7"],
  ["DailyGM", "0x609A9D897DB4c554a03d4304c8EF42b56ea32e31"],
  ["NexioEURCVault", "0xb30c9272a28749Ae0B04E1d5977337a570025009"],
  ["NexioUSDCVault", "0x045700Cd0D442E65dcB549330580d9981bcbC5E0"],
  ["NexioSwap", "0xD3504e2118b1c7a52cf44947510633562635ee03"],
] as const;

function SwapMotion() {
  return (
    <svg viewBox="0 0 760 180" className="w-full" role="img" aria-label="USDC moving through Achswap into EURC">
      <rect x="16" y="48" width="140" height="72" rx="14" fill="#082033" stroke="#67e8f9" />
      <text x="86" y="78" textAnchor="middle" fill="#ecfeff" fontSize="13">User wallet</text>
      <text x="86" y="98" textAnchor="middle" fill="#a5f3fc" fontSize="12">USDC</text>
      <rect x="210" y="40" width="160" height="88" rx="14" fill="#082033" stroke="#22d3ee" />
      <text x="290" y="74" textAnchor="middle" fill="#ecfeff" fontSize="13">Achswap quote</text>
      <text x="290" y="94" textAnchor="middle" fill="#a5f3fc" fontSize="11">Route executor</text>
      <rect x="424" y="40" width="160" height="88" rx="14" fill="#082033" stroke="#34d399" />
      <text x="504" y="74" textAnchor="middle" fill="#ecfeff" fontSize="13">UnitFlowV3</text>
      <text x="504" y="94" textAnchor="middle" fill="#a7f3d0" fontSize="11">Liquidity pools</text>
      <rect x="620" y="48" width="124" height="72" rx="14" fill="#082033" stroke="#6ee7b7" />
      <text x="682" y="78" textAnchor="middle" fill="#ecfeff" fontSize="13">Settled</text>
      <text x="682" y="98" textAnchor="middle" fill="#a7f3d0" fontSize="12">EURC</text>
      <path id="nx-swap-path" d="M156 84 H210 M370 84 H424 M584 84 H620" fill="none" />
      <line x1="156" y1="84" x2="210" y2="84" stroke="#67e8f9" className="nx-dash" />
      <line x1="370" y1="84" x2="424" y2="84" stroke="#22d3ee" className="nx-dash" />
      <line x1="584" y1="84" x2="620" y2="84" stroke="#34d399" className="nx-dash" />
      <circle r="5" fill="#67e8f9" className="nx-particle" style={{ offsetPath: "path('M170 84 H200')" }} />
      <circle r="5" fill="#22d3ee" className="nx-particle" style={{ offsetPath: "path('M380 84 H414')", animationDelay: "0.6s" }} />
      <circle r="5" fill="#6ee7b7" className="nx-particle" style={{ offsetPath: "path('M590 84 H614')", animationDelay: "1.2s" }} />
      <g className="nx-lock">
        <rect x="248" y="112" width="18" height="12" rx="2" fill="none" stroke="#fbbf24" />
        <path d="M251 112 v-4 a6 6 0 0 1 12 0 v4" fill="none" stroke="#fbbf24" />
      </g>
      <text x="290" y="148" textAnchor="middle" fill="#fde68a" fontSize="10">Allowance checked before /swap</text>
    </svg>
  );
}

function IdentityMotion() {
  return (
    <svg viewBox="0 0 760 180" className="w-full" role="img" aria-label="Wallet bound to one .nex name">
      <rect x="24" y="52" width="180" height="70" rx="14" fill="#082033" stroke="#67e8f9" />
      <text x="114" y="82" textAnchor="middle" fill="#ecfeff" fontSize="13">0xWalletAddress</text>
      <text x="114" y="102" textAnchor="middle" fill="#a5f3fc" fontSize="11">One address</text>
      <rect x="280" y="40" width="200" height="94" rx="14" fill="#082033" stroke="#22d3ee" />
      <text x="380" y="78" textAnchor="middle" fill="#ecfeff" fontSize="13">ArcNameService</text>
      <text x="380" y="98" textAnchor="middle" fill="#a5f3fc" fontSize="11">0xE3Fd…5Ed7</text>
      <rect x="556" y="52" width="176" height="70" rx="14" fill="#082033" stroke="#6ee7b7" />
      <text x="644" y="82" textAnchor="middle" fill="#ecfeff" fontSize="13">name.nex</text>
      <text x="644" y="102" textAnchor="middle" fill="#a7f3d0" fontSize="11">Permanent binding</text>
      <line x1="204" y1="78" x2="280" y2="78" stroke="#67e8f9" className="nx-dash" />
      <line x1="204" y1="98" x2="280" y2="98" stroke="#22d3ee" className="nx-dash" />
      <line x1="480" y1="87" x2="556" y2="87" stroke="#34d399" className="nx-dash" />
      <circle r="4" fill="#67e8f9" className="nx-pulse" cx="242" cy="78" />
      <circle r="4" fill="#6ee7b7" className="nx-pulse" cx="518" cy="87" style={{ animationDelay: "0.8s" }} />
      <text x="380" y="158" textAnchor="middle" fill="#e2e8f0" fontSize="11">resolve and resolveByAddress. A second name from the same wallet is rejected.</text>
    </svg>
  );
}

function VaultMotion() {
  return (
    <svg viewBox="0 0 760 180" className="w-full" role="img" aria-label="Vault deposits marked by the Achswap EURC quote">
      <rect x="20" y="50" width="150" height="76" rx="14" fill="#082033" stroke="#67e8f9" />
      <text x="95" y="82" textAnchor="middle" fill="#ecfeff" fontSize="13">Wallet</text>
      <text x="95" y="102" textAnchor="middle" fill="#a5f3fc" fontSize="11">USDC / EURC</text>
      <rect x="230" y="28" width="150" height="56" rx="12" fill="#082033" stroke="#22d3ee" />
      <text x="305" y="52" textAnchor="middle" fill="#ecfeff" fontSize="12">USDC vault</text>
      <text x="305" y="68" textAnchor="middle" fill="#a5f3fc" fontSize="10">0x0457…C5E0</text>
      <rect x="230" y="96" width="150" height="56" rx="12" fill="#082033" stroke="#34d399" />
      <text x="305" y="120" textAnchor="middle" fill="#ecfeff" fontSize="12">EURC vault</text>
      <text x="305" y="136" textAnchor="middle" fill="#a7f3d0" fontSize="10">0xb30c…5009</text>
      <rect x="460" y="50" width="130" height="76" rx="14" fill="#082033" stroke="#fbbf24" />
      <text x="525" y="82" textAnchor="middle" fill="#fde68a" fontSize="12">Achswap</text>
      <text x="525" y="102" textAnchor="middle" fill="#fcd34d" fontSize="11">1 EURC quote</text>
      <rect x="630" y="50" width="110" height="76" rx="14" fill="#082033" stroke="#e2e8f0" />
      <text x="685" y="84" textAnchor="middle" fill="#f8fafc" fontSize="12">Net worth</text>
      <text x="685" y="104" textAnchor="middle" fill="#cbd5e1" fontSize="10">amountOut</text>
      <line x1="170" y1="70" x2="230" y2="56" stroke="#67e8f9" className="nx-dash" />
      <line x1="170" y1="100" x2="230" y2="124" stroke="#34d399" className="nx-dash" />
      <line x1="380" y1="88" x2="460" y2="88" stroke="#fbbf24" className="nx-dash" />
      <line x1="590" y1="88" x2="630" y2="88" stroke="#e2e8f0" className="nx-dash" />
      <circle r="4" fill="#fbbf24" className="nx-particle" style={{ offsetPath: "path('M390 88 H450')" }} />
    </svg>
  );
}

function BatchMotion() {
  return (
    <svg viewBox="0 0 760 190" className="w-full" role="img" aria-label="One batch transaction split across recipients, metered by Daily GM streak">
      <rect x="24" y="70" width="120" height="52" rx="12" fill="#082033" stroke="#67e8f9" />
      <text x="84" y="100" textAnchor="middle" fill="#ecfeff" fontSize="13">1 transaction</text>
      <line x1="144" y1="96" x2="230" y2="46" stroke="#67e8f9" className="nx-dash" />
      <line x1="144" y1="96" x2="230" y2="96" stroke="#22d3ee" className="nx-dash" />
      <line x1="144" y1="96" x2="230" y2="146" stroke="#34d399" className="nx-dash" />
      {["name.nex", "0x recipient", "0x recipient"].map((label, index) => (
        <g key={label + index}>
          <rect x="230" y={24 + index * 50} width="150" height="40" rx="10" fill="#082033" stroke="#94a3b8" />
          <text x="305" y={48 + index * 50} textAnchor="middle" fill="#e2e8f0" fontSize="12">{label}</text>
        </g>
      ))}
      <rect x="430" y="36" width="300" height="120" rx="14" fill="#082033" stroke="#fbbf24" />
      <text x="580" y="62" textAnchor="middle" fill="#fde68a" fontSize="12">Daily GM streak meter</text>
      {["7", "30", "90", "180"].map((day, index) => (
        <g key={day}>
          <rect x={460 + index * 64} y="84" width="48" height="48" rx="8" fill="none" stroke="#fbbf24" />
          <text x={484 + index * 64} y="114" textAnchor="middle" fill="#fef3c7" fontSize="14">{day}</text>
        </g>
      ))}
      <rect x="460" y="140" width="240" height="6" rx="3" fill="#1e293b" />
      <rect x="460" y="140" width="150" height="6" rx="3" fill="#fbbf24" className="nx-pulse" />
    </svg>
  );
}

function MotionFor({ id }: { id: ChapterId }) {
  if (id === "identity") return <IdentityMotion />;
  if (id === "vaults") return <VaultMotion />;
  if (id === "gm") return <BatchMotion />;
  return <SwapMotion />;
}

export default function Documentation() {
  const [chapter, setChapter] = useState<ChapterId>("start");

  return (
    <div className="w-full space-y-8 text-slate-100">
      <nav className="flex gap-2 overflow-x-auto pb-2">
        {CHAPTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setChapter(id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${chapter === id ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/10 bg-white/5 text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="rounded-3xl border border-white/10 bg-[#07111f] p-6 md:p-10">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Arc Mainnet documentation</div>
        <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight md:text-5xl">From Wallet Connection to Verified Arc Mainnet Settlement</h2>
        <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm leading-relaxed text-cyan-50">
          Nexio reads balances, vaults, names, and Daily GM streaks from Arc Mainnet contracts. USDC/EURC swap amounts are the Achswap `amountOut` and `minAmountOut` integers. The page does not invent a second price.
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#quickstart" onClick={() => setChapter("quickstart")} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950">Open quickstart</a>
          <a href="/docs.txt" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold">docs.txt</a>
          <a href="/llms.txt" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold">llms.txt</a>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[["< 1s Arc Finality", "Settlement target on Arc Mainnet, chain 5042."], ["Exact Achswap Quotes", "Receive amounts are formatUnits(amountOut)."], ["On-Chain Verified", "Names, streaks, and vault balances are contract reads."]].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-lg font-black">{title}</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#050b14] p-4">
        <MotionFor id={chapter} />
      </section>

      {chapter === "start" && (
        <section className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p>Connect a wallet on chain 5042. Gas is USDC. The ERC-20 interface `0x3600000000000000000000000000000000000000` is the same balance as native USDC, scaled from 18 decimals to 6.</p>
          <p>EURC is `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`. Portfolio marks use a 1 EURC to USDC Achswap quote with no Nexio partner fee. Swap execution quotes include the streak fee and are the amounts the wallet will receive.</p>
        </section>
      )}

      {chapter === "quickstart" && (
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Copy `.env.example` to `.env.local` and set `ACHSWAP_API_KEY`.</li>
          <li>Optional: set `ACHSWAP_FEE_RECIPIENT`. The default is `0x9AFe5CeF11fC10756faef213f7A30D9873B5d372`.</li>
          <li>Run `npm run dev` and open the app. Switch the wallet to Arc Mainnet.</li>
          <li>Read the portfolio rate. Enter a swap amount and confirm the receive field matches Achswap `amountOut`.</li>
          <li>Register one `.nex` name, or recover the name already bound to the wallet.</li>
        </ol>
      )}

      {chapter === "concepts" && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3">Module / use case</th>
                <th className="px-4 py-3">On-chain contract / endpoint</th>
                <th className="px-4 py-3">Security guarantee and result</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              <tr className="border-t border-white/10"><td className="px-4 py-3">Swap</td><td className="px-4 py-3">POST /api/achswap/quote and /swap</td><td className="px-4 py-3">Server holds the API key. amountOut is shown verbatim.</td></tr>
              <tr className="border-t border-white/10"><td className="px-4 py-3">Name</td><td className="px-4 py-3">ArcNameService</td><td className="px-4 py-3">One address, one name. Taken names stay unavailable.</td></tr>
              <tr className="border-t border-white/10"><td className="px-4 py-3">Streak fee</td><td className="px-4 py-3">DailyGM.streak</td><td className="px-4 py-3">The server sets feeBps. The client cannot choose it.</td></tr>
              <tr className="border-t border-white/10"><td className="px-4 py-3">Liquidity add</td><td className="px-4 py-3">Achswap V2 router</td><td className="px-4 py-3">Blocked when the pool is more than 5% from the live quote.</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {chapter === "achswap" && (
        <section className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>Base URL `https://trade.achswap.app/api/v1`. Nexio proxies `POST /quote` and `POST /swap`. Identical quotes share one in-flight call and a 3-second cache. HTTP 429 is retried.</p>
          <p>A portfolio mark sends no trader, so `feeBps` is 0. A swap quote sends the wallet. The server reads `DailyGM.streak` and sets `feeBps` to 20, 15, 10, 5, or 0, with `feeRecipient` when the fee is above 0. If Achswap rejects that fee, the proxy retries once with `feeBps` 0.</p>
          <p>Approval is mined and `allowance` is re-read before the signed `/swap` payload is requested.</p>
        </section>
      )}

      {chapter === "identity" && (
        <section className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>`register` reverts when the name is taken or the sender already has a domain. The app calls `hasDomain`, `resolveByAddress`, and `isAvailable` before it asks the wallet to register.</p>
          <p>Identity Vault calls `resolveByAddress` for the connected wallet. Sync writes that name into the profile and Nexio Pass. Clearing browser storage does not clear the chain.</p>
        </section>
      )}

      {chapter === "vaults" && (
        <section className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>USDC vault `0x045700Cd0D442E65dcB549330580d9981bcbC5E0` and EURC vault `0xb30c9272a28749Ae0B04E1d5977337a570025009` record `stakedBalance`. Net worth is wallet plus staked USDC, plus wallet plus staked EURC marked at the 1 EURC Achswap `amountOut`.</p>
          <p>Max USDC spends leave 0.005 USDC for gas. Liquidity removal stays available when adds are blocked.</p>
        </section>
      )}

      {chapter === "gm" && (
        <section className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>Daily GM `checkIn` requires 24 hours and increments `streak`. Tiers are 0–6 days at 20 bps and 5 recipients, 7 days at 15 bps and 15 recipients, 30 days at 10 bps and 30 recipients, 90 days at 5 bps and 50 recipients, and 180 days at 0 bps with no batch cap.</p>
          <p>There is no token reward. The streak only changes the Nexio partner fee, the batch cap, and which status panels are shown.</p>
        </section>
      )}

      {chapter === "contracts" && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-slate-400">
              <tr><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Address</th></tr>
            </thead>
            <tbody>
              {CONTRACTS.map(([name, address]) => (
                <tr key={name} className="border-t border-white/10">
                  <td className="px-4 py-3 font-bold">{name}</td>
                  <td className="px-4 py-3 font-mono text-xs"><a className="text-cyan-300" href={`https://explorer.arc.io/address/${address}`}>{address}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {chapter === "specs" && (
        <section className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>Plain-text copies of this guide are served at <a className="text-cyan-300" href="/docs.txt">/docs.txt</a> and <a className="text-cyan-300" href="/llms.txt">/llms.txt</a>.</p>
          <p>Error codes from the proxy: `INVALID_REQUEST`, `MISSING_API_KEY`, `UNAUTHORIZED`, `NO_ROUTE`, `RATE_LIMITED`, `SIMULATION_FAILED`, `UNAVAILABLE`.</p>
        </section>
      )}

      <aside className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-50">
        Architectural guardrail: do not price EURC from the V2 router, do not treat USDC and EURC as 1:1, and do not put `ACHSWAP_API_KEY` in a public environment variable. Chain ID 5042 is the only network.
      </aside>

      <section>
        <h3 className="text-2xl font-black">Everything in this guide</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["Swap aggregator", "Quote, approve, allowance check, then the signed Achswap transaction."],
            ["Identity", "One address, one .nex name, with on-chain recovery."],
            ["Vaults", "Stake and withdraw USDC or EURC. Net worth uses the spot amountOut."],
            ["LP guard", "Adds stop when the pool diverges more than 5% from the live quote."],
            ["Daily GM", "7, 30, 90, and 180 day fee and batch tiers. No reward token."],
            ["Gas", "Max leaves 0.005 USDC so the token transfer and the fee can both clear."],
            ["Error codes", "INVALID_REQUEST, MISSING_API_KEY, NO_ROUTE, RATE_LIMITED, SIMULATION_FAILED."],
            ["FAQ", "A cleared browser still recovers a name through resolveByAddress."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="font-black">{title}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
