# Nexio

**Enterprise-grade stablecoin management built on the lightning-fast Arc L1 Network.**

Nexio makes blockchain payments as simple as traditional banking. Send USDC and EURC to a human-readable `.nex` name, scan a QR code, or pay a whole list of recipients with the batch transfer tool. Balances, vaults, swaps, and liquidity sit in the same interface, on Arc Mainnet.

Arc uses USDC for gas. Nexio treats that USDC as the 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`, which is the same balance as the native gas token.

| | |
| --- | --- |
| Network | Arc Mainnet |
| Chain ID | `5042` |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | [explorer.arc.io](https://explorer.arc.io) |
| Stablecoins | USDC (6 decimals) and EURC (6 decimals) |

## Contents

- [Features](#features)
- [Tech stack and architecture](#tech-stack-and-architecture)
- [Live Arc Mainnet contracts](#live-arc-mainnet-contracts)
- [Local setup](#local-setup)
- [Scripts](#scripts)
- [Project layout](#project-layout)

## Features

The app is one Next.js screen. The sidebar switches between Dashboard, Portfolio & DeFi, Nexio Swap, Liquidity, Daily GM, Nexio Domains, Nexio Pass, History, and Learn. `/?tab=lp` opens Liquidity directly, and `/lp` redirects there. Learn is an in-app guide, so product education lives in the UI.

### Portfolio & DeFi

Portfolio & DeFi is the balance and yield view.

- Wallet balances for USDC and EURC, including USDC held as native gas.
- Deposit and withdraw on the EURC vault and the USDC vault. Each vault tracks a staked balance and pending yield for the connected wallet.
- An allocation bar for USDC and EURC, including amounts sitting in the vaults.
- Nexio Loyalty Points (NLP) accrued from vault participation. Points are an engagement record inside Nexio, not a transferable token.
- A live EURC reference rate read from the Achswap V2 pool, shown next to portfolio value.

Dashboard is the home view: connect a wallet, see balances, and open Send.

### Nexio Swap

Nexio Swap exchanges USDC and EURC on Arc Mainnet. Quotes and execution use the **Achswap Developer API** (`https://trade.achswap.app/api/v1`), which searches liquidity across the pools Achswap indexes. A single pool quote cannot see that depth, so the API is what produces the exact-input route.

The browser never calls Achswap directly. Achswap does not send CORS headers. The page calls Nexio, and the Next.js route attaches the API key.

1. **Quote.** `POST /api/achswap/quote` sends `tokenIn`, `amountIn`, `tokenOut`, `feeBps: 0`, and `slippageBps` (0 to 2000, so at most 20%). The receive field shows `amountOut`. The minimum shown is Achswap's `minAmountOut`, already net of fees and slippage.
2. **Approve.** If the quote names an `executor`, the wallet approves the input token for that address and waits for the transaction to mine. After `POST /api/achswap/swap`, Nexio checks allowance against `approval.spender` from the response, which is the route executor for that quote, and approves it when the allowance is short.
3. **Sign.** Achswap returns a transaction (`to`, `data`, `value`). The connected wallet sends that payload with ethers.js. The user keeps USDC aside for gas.

`NO_ROUTE` is shown as **No route found.** Large price impact or a steep stablecoin value loss disables the button before a signature is requested.

### Liquidity (LP)

Liquidity adds and removes USDC/EURC liquidity on the Achswap V2 pool.

- Add both assets. On an existing pool, the other side is quoted from reserves so the deposit follows the pool ratio.
- Remove LP tokens and preview the USDC and EURC that come back.
- See the pool reserves, your LP balance, and your share of the pool.

Slippage for liquidity is separate from swap slippage. This screen still talks to the Achswap V2 router and factory. It does not use the swap API.

### Daily GM

Daily GM is an on-chain check-in. `checkIn()` on the Daily GM contract requires 24 hours since the previous check-in, then increments a streak stored on Arc. The cooldown is the contract's clock, so clearing site data does not reset it. The screen shows the current streak and the time remaining until the next GM.

### Nexio Domains / Nexio Name Service

Nexio Name Service (the Nex Name Service contract) replaces a raw address with a `.nex` name.

- Register one name per wallet. The name is stored on Arc and resolves forward to the owner and backward to the name.
- Send to `name.nex`. Nexio resolves it to an address before the transfer is built.
- The registered name appears on Nexio Pass and anywhere the app shows the connected identity.

### Nexio Pass and batch transfers

**Nexio Pass** is a downloadable identity card for the connected wallet. It shows the `.nex` name when one is registered, a shortened address, and the Daily GM streak, so the same on-chain identity can be saved and shared as an image.

**Batch transfer** is the payroll-style send tool on the Send screen.

- Turn on Batch Transfer and enter recipients separated by commas. Each entry can be an `0x` address or a `.nex` name.
- Set one amount. That amount is sent to each recipient.
- Nexio resolves every name, then asks the wallet to sign each transfer in order, waiting 500ms between broadcasts.
- Progress is reported as each transaction is signed, and each result is written to History.

Single sends, QR scan, and payment links use the same Send flow. Scan QR fills the recipient from a camera. A payment link encodes the recipient, asset, and amount. Opening that link loads Nexio with the Send form already filled.

History keeps the latest 50 actions for that wallet in the browser (`nexio_history_<address>`), with the transaction hash when one exists.

## Tech stack and architecture

| Layer | What Nexio uses |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Wallet and contracts | ethers.js v6. Reads use a JSON-RPC provider. Writes use the connected wallet's ethers signer. |
| Contracts | Solidity, compiled and deployed with Hardhat (compiler 0.8.24) |
| Swap routing | Achswap Developer API, REST, JSON in and JSON out |
| Chain | Arc Mainnet, chain ID `5042`. Gas is USDC. |

```text
Browser (Next.js UI, ethers.js)
        │
        ├─ balances, vaults, domains, Daily GM, liquidity
        │     └─ Arc Mainnet RPC  →  Nexio contracts and Achswap V2
        │
        └─ USDC ↔ EURC swap
              └─ POST /api/achswap/quote and /api/achswap/swap
                    └─ https://trade.achswap.app/api/v1
                          └─ { to, data, value } signed by the user's wallet
```

Swap requests from the page hit `app/api/achswap/[action]/route.ts`. That route checks the body, forces `feeBps` to `0` and `chainId` to `5042`, and calls Achswap with:

- `Authorization: Bearer <key>`
- `x-api-key: <key>`

The key is `ACHSWAP_API_KEY`. If that variable is empty, the server reads `NEXT_PUBLIC_ACHSWAP_API_KEY`. Prefer the server-only name so the key is not referenced by client code.

Token addresses used by swaps and liquidity on mainnet:

| Token | Address | Decimals |
| --- | --- | --- |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` | 6 |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 |

Achswap V2, used by Liquidity and the portfolio rate:

| Contract | Address |
| --- | --- |
| Factory | `0xb0C2B0acb9c13079dDd871eDaF43Aabf6e88C530` |
| Router | `0x52FE40c00530db2e43d01652f903870571A14AFD` |

## Live Arc Mainnet contracts

These five Nexio contracts are deployed on **Arc Mainnet (chain ID 5042)**. Source addresses match `deployments/arc-mainnet.json`.

| Product name | Contract | Address |
| --- | --- | --- |
| Nex Name Service | `NexNameService` | [`0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7`](https://explorer.arc.io/address/0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7) |
| Daily GM | `DailyGM` | [`0x609A9D897DB4c554a03d4304c8EF42b56ea32e31`](https://explorer.arc.io/address/0x609A9D897DB4c554a03d4304c8EF42b56ea32e31) |
| EURC Vault | `NexioVault` | [`0xb30c9272a28749Ae0B04E1d5977337a570025009`](https://explorer.arc.io/address/0xb30c9272a28749Ae0B04E1d5977337a570025009) |
| USDC Vault | `NexioUSDCVault` | [`0x045700Cd0D442E65dcB549330580d9981bcbC5E0`](https://explorer.arc.io/address/0x045700Cd0D442E65dcB549330580d9981bcbC5E0) |
| Nexio Swap | `NexioSwap` | [`0xD3504e2118b1c7a52cf44947510633562635ee03`](https://explorer.arc.io/address/0xD3504e2118b1c7a52cf44947510633562635ee03) |

Deployer: `0x9AFe5CeF11fC10756faef213f7A30D9873B5d372`.

The swap screen does not call `NexioSwap` for quotes or execution. That screen uses the Achswap Developer API so routing can span more than one pool. `NexioSwap` remains the deployed mainnet contract at the address above.

## Local setup

### Prerequisites

- Node.js 20 or newer
- npm
- A wallet that can add Arc Mainnet (chain ID `5042`) and hold USDC for gas

### Install

```bash
git clone <repository-url>
cd nexio-app
npm install
```

### Environment

Copy the example file and fill in the Achswap key:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` is gitignored. `NEXT_PUBLIC_NETWORK` must be `mainnet`. Without that, the app stays on Arc Testnet and Nexio Swap will not request Achswap routes.

```bash
NEXT_PUBLIC_NETWORK=mainnet

NEXT_PUBLIC_ANS_ADDRESS=0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7
NEXT_PUBLIC_DAILY_GM_ADDRESS=0x609A9D897DB4c554a03d4304c8EF42b56ea32e31
NEXT_PUBLIC_EURC_VAULT_ADDRESS=0xb30c9272a28749Ae0B04E1d5977337a570025009
NEXT_PUBLIC_USDC_VAULT_ADDRESS=0x045700Cd0D442E65dcB549330580d9981bcbC5E0
NEXT_PUBLIC_NEXIO_SWAP_ADDRESS=0xD3504e2118b1c7a52cf44947510633562635ee03

# Required for Nexio Swap. Request a key from Achswap (support@achswap.app).
# Do not commit this file.
ACHSWAP_API_KEY=ach_dev_your_key_here

# Used only when ACHSWAP_API_KEY is empty. Prefer ACHSWAP_API_KEY.
NEXT_PUBLIC_ACHSWAP_API_KEY=
```

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_NETWORK` | `mainnet` selects chain ID `5042`, the 6-decimal USDC path, and Achswap swap routing. |
| `ACHSWAP_API_KEY` | Server-side key for `POST /quote` and `POST /swap`. Swap quotes fail until this is set. |
| `NEXT_PUBLIC_ACHSWAP_API_KEY` | Fallback key name. Leave it empty when `ACHSWAP_API_KEY` is set. |
| `NEXT_PUBLIC_*_ADDRESS` | Optional overrides for the five Nexio contracts. The values above are the live mainnet deployments. |

Hardhat reads `PRIVATE_KEY` from `.env`, not from `.env.local`. Never put a private key in a `NEXT_PUBLIC_` variable. You do not need `PRIVATE_KEY` to run the website.

Restart the dev server after changing any environment variable. Next.js loads them at startup.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect a wallet on Arc Mainnet. If the wallet is on another chain, Nexio asks it to switch to chain ID `5042`.

To confirm the swap key, enter a USDC or EURC amount on Nexio Swap. A missing key shows **Set NEXT_PUBLIC_ACHSWAP_API_KEY before swapping.** A rejected key shows that Achswap did not accept it. A pair with no route shows **No route found.**

Production build:

```bash
npm run build
npm start
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run compile` | Compile the Solidity contracts with Hardhat |
| `npm run deploy:mainnet` | Deploy with `scripts/deploy_mainnet.ts` on `arc_mainnet` (requires `PRIVATE_KEY` in `.env`) |

The mainnet contracts in the table above are already deployed. `deploy:mainnet` is for a new deployment, not for day-to-day use of the app.

## Project layout

```text
app/page.tsx                         App UI, including swap, liquidity, send, and pass
app/lp/page.tsx                      Redirects to /?tab=lp
app/api/achswap/[action]/route.ts    Quote and swap proxy
lib/contracts.ts                     Network, addresses, ABIs, formatting
lib/achswap.ts                       Quote and swap client used by the UI
lib/achswap-server.ts                Achswap request, auth header, body checks
contracts/                           NexNameService, DailyGM, vaults, NexioSwap
deployments/arc-mainnet.json         Live addresses and deployment transactions
.env.example                         Environment template
```

## Wallet setup

Add Arc Mainnet in the wallet before the first transaction:

| Field | Value |
| --- | --- |
| Network name | Arc Mainnet |
| Chain ID | `5042` |
| RPC URL | `https://rpc.mainnet.arc.io` |
| Currency symbol | USDC |
| Block explorer | `https://explorer.arc.io` |

Keep a USDC balance for gas. Spending the entire USDC balance on a swap or transfer can leave nothing for the network fee. The Max button on swap and liquidity reserves a small gas buffer.
