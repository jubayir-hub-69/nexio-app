# 🏦 Nexio: Enterprise Web3 Stablecoin Management & Identity Protocol

Nexio (formerly ArcBank) is an enterprise-grade, decentralized application (dApp) built on the Arc L1 Network. I designed this protocol to simplify Web3 stablecoin transactions by combining seamless USDC/EURC payments, a custom on-chain identity system, and a robust advanced DeFi ecosystem. It bridges the gap between complex blockchain mechanics and a user-friendly, traditional fintech experience.

## ✨ Core Features & Functionalities

### 🌐 1. Nexio Name Service (NNS) - Web3 Identity
I built and integrated a custom On-Chain Name Registry Smart Contract.
* **Functionality:** Users can register unique, permanent `.nex` domains (e.g., `jubayir.nex`) directly on the Arc blockchain.
* **Use Case:** Replaces complex, error-prone `0x...` wallet addresses with a personalized, human-readable Web3 identity.

### 💸 2. Smart Domain & QR-Resolved Payments
The transaction engine is fully integrated with the smart contract registry and hardware peripherals.
* **Functionality:** The system automatically resolves `.nex` domain names into EVM addresses in the backend. Additionally, an integrated **QR Code Scanner** allows users to instantly scan and auto-fill recipient addresses via their device camera.
* **Use Case:** Guarantees 100% error-free transfers. Users can send USDC or EURC to a domain name or scan a code just like traditional mobile banking.

### 🚀 3. Optimized Batch Transfer Engine (RPC Anti-Spam)
An advanced transaction feature designed for bulk payments and payrolls.
* **Functionality:** Users can input multiple comma-separated addresses or `.nex` domains simultaneously. The engine individually resolves each domain and executes all transfers in a single workflow. *(Update v0.7.2: Implemented an 8-second smart delay mechanism to bypass public RPC rate limits).*
* **Use Case:** Highly useful for businesses, payrolls, or airdropping tokens without server overload.

### 🔗 4. Automated Payment Links (Invoicing)
A streamlined system to request crypto payments natively.
* **Functionality:** Users can generate a unique, shareable URL containing their specific payment request (Target Address, Asset Type, and Amount).
* **Use Case:** When the payer clicks the link, the Nexio app opens and automatically pre-fills the "Send Modal" with the exact details, requiring only one click to confirm the payment.

### 🔄 5. Advanced DeFi: Swap & Liquidity Pools
Integrated with real on-chain AMM routing for a complete decentralized finance experience.
* **Functionality:** Powered by the live Achswap Router & Factory contracts. Users can seamlessly swap between USDC and EURC with live market rates, or provide liquidity to pools to earn protocol fees and manage LP tokens.
* **Use Case:** Transforms Nexio from a simple wallet into a comprehensive Web3 exchange and asset management platform.

### 🏦 6. DeFi Vault & Nexio Loyalty Points (NLP)
A gamified staking system to reward active ecosystem participants.
* **Functionality:** Users can securely stake their native assets into Nexio's Vault Smart Contracts to yield **Nexio Loyalty Points (NLP)** over time. 
* **Use Case:** NLP tracks ecosystem engagement, builds on-chain reputation, and rewards long-term holders.

### 🔥 7. Hacker-Proof On-Chain Daily GM
A secure, gamified engagement feature strictly enforced by the blockchain.
* **Functionality:** Users execute a zero-value smart contract transaction to establish their daily presence. The 24-hour cooldown is strictly enforced via a deployed smart contract, making it entirely immune to browser cookie-clearing exploits.
* **Use Case:** Builds an immutable, verifiable on-chain activity streak and encourages daily network interaction securely.

### 📊 8. Real-Time Portfolio & Live Market Rates
A comprehensive, dynamic dashboard for asset management.
* **Functionality:** Fetches live balances of native USDC and smart-contract-based EURC. Instead of using hardcoded values, it dynamically quotes exchange rates directly from the live Achswap Router.
* **Use Case:** Gives users complete transparency, real-time financial status, and an instant overview of their net worth based on true on-chain market conditions.

### 💳 9. Nexio Pass: Digital Holographic ID
A dynamic visual representation of a user's on-chain data.
* **Functionality:** Generates a downloadable, high-quality Web3 ID card that displays the user's verified `.nex` domain, masked wallet address, and current GM streak in a premium holographic UI.
* **Use Case:** Allows users to easily share and flex their verified Web3 identity on platforms like X (Twitter) or Discord.

## 🛠️ Tech Stack
* **Frontend:** Next.js (React), TypeScript, Tailwind CSS
* **Web3 Integration:** ethers.js, Custom Smart Contracts (Solidity)
* **Blockchain:** Arc L1 Network (Testnet)
* **DeFi Routing:** Achswap Router & Factory Contracts
* **Deployment:** Vercel
* 
