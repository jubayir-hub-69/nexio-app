export const PROTOCOL_SPEC = `Nexio | Arc Mainnet
Chain ID: 5042
RPC: https://rpc.mainnet.arc.io
Explorer: https://explorer.arc.io

Contracts
ArcNameService 0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7
DailyGM 0x609A9D897DB4c554a03d4304c8EF42b56ea32e31
NexioEURCVault 0xb30c9272a28749Ae0B04E1d5977337a570025009
NexioUSDCVault 0x045700Cd0D442E65dcB549330580d9981bcbC5E0
NexioSwap 0xD3504e2118b1c7a52cf44947510633562635ee03

Tokens
USDC ERC-20 0x3600000000000000000000000000000000000000 decimals 6
EURC 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1 decimals 6
Native USDC uses 18 decimals and is the same balance as the ERC-20, scaled by 10^12.

Achswap
Browser calls POST /api/achswap/quote and POST /api/achswap/swap.
The server sends ACHSWAP_API_KEY. The key is not public.
Quotes cache for 3 seconds and share identical in-flight calls. HTTP 429 is retried.
Portfolio mark: 1 EURC to USDC with feeBps 0. Display formatUnits(amountOut, 6).
Swap: server reads DailyGM.streak(sender) and sets feeBps.
0-6 days: 20 bps, batch 5
7+ days: 15 bps, batch 15, Verified Active Sender
30+ days: 10 bps, batch 30, priority LP analytics
90+ days: 5 bps, batch 50, vault telemetry
180+ days: 0 bps, unlimited batch, VIP
feeRecipient defaults to 0x9AFe5CeF11fC10756faef213f7A30D9873B5d372
Override with ACHSWAP_FEE_RECIPIENT.
If Achswap rejects the fee, the proxy retries with feeBps 0.
Approval is mined and allowance is re-read before the signed swap payload.

Names
One address can register one .nex name.
A registered name resolves to one owner and cannot be registered again.
Recovery calls resolveByAddress(wallet).

Liquidity
Adds are blocked when the V2 reserve price is more than 5 percent from the live Achswap EURC quote.
Withdrawals stay open.
USDC max spends leave 0.005 USDC for gas.

Errors
INVALID_REQUEST, MISSING_API_KEY, UNAUTHORIZED, NO_ROUTE, RATE_LIMITED, SIMULATION_FAILED, UNAVAILABLE.
`;
