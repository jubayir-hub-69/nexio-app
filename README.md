# 🏦 Nexio: Enterprise Web3 Stablecoin Management & Identity Protocol

**Nexio** (formerly ArcBank) is an enterprise-grade, decentralized application (dApp) built on the Arc L1 Network. I designed this protocol to simplify Web3 stablecoin transactions by combining seamless USDC/EURC payments with a custom on-chain identity system. It bridges the gap between complex blockchain mechanics and a user-friendly, traditional fintech experience.

---

## ✨ Core Features & Functionalities

### 🌐 1. Nexio Name Service (NNS) - Web3 Identity
I built and integrated a custom On-Chain Name Registry Smart Contract.
* **Functionality:** Users can register unique, permanent `.nex` domains (e.g., `jubayir.nex`) directly on the Arc blockchain.
* **Use Case:** Replaces complex, error-prone `0x...` wallet addresses with a personalized, human-readable Web3 identity.

### 💸 2. Smart Domain-Resolved Payments
The transaction engine is fully integrated with the smart contract registry.
* **Functionality:** When sending funds, the system automatically resolves `.nex` domain names into their corresponding EVM addresses in the backend before broadcasting the transaction.
* **Use Case:** Guarantees 100% error-free transfers. Users can send USDC or EURC to a domain name just like sending an email.

### 🚀 3. Optimized Batch Transfer Engine (RPC Anti-Spam)
An advanced transaction feature designed for bulk payments and payrolls.
* **Functionality:** Users can input multiple comma-separated addresses or `.nex` domains simultaneously. The engine individually resolves each domain and executes all transfers in a single workflow. *(Update v0.7.2: Implemented an 8-second smart delay mechanism to bypass public RPC rate limits and prevent silent wallet failures during mass payouts).*
* **Use Case:** Highly useful for businesses, payrolls, or airdropping tokens to multiple community members without server overload.

### 🔗 4. Automated Payment Links (Invoicing)
A streamlined system to request crypto payments natively.
* **Functionality:** Users can generate a unique, shareable URL containing their specific payment request (Target Address, Asset Type, and Amount).
* **Use Case:** When the payer clicks the link, the Nexio app opens and automatically pre-fills the "Send Modal" with the exact invoice details, requiring only one click to confirm the payment.

### 🔥 5. Daily GM Protocol (On-Chain Streak)
A gamified engagement feature leveraging smart contracts.
* **Functionality:** Users sign a zero-value transaction to establish their presence on the Arc Network. The protocol tracks and updates their consecutive daily streak.
* **Use Case:** Builds an immutable, verifiable on-chain activity history and encourages daily network interaction.

### 🪪 6. Nexio Pass: Digital Holographic ID
A dynamic visual representation of a user's on-chain data.
* **Functionality:** Generates a downloadable, high-quality Web3 ID card that displays the user's verified `.nex` domain, masked wallet address, and current GM streak in a premium holographic UI.
* **Use Case:** Allows users to easily share and flex their verified Web3 identity on platforms like X (Twitter) or Discord.

### 📊 7. Real-Time Portfolio & Verifiable History
A comprehensive dashboard for asset management.
* **Functionality:** Fetches live balances of native USDC and smart-contract-based EURC. Background balance polling automatically pauses during transactions to free up RPC resources. It also maintains a localized, human-readable transaction history of all actions performed within the app.
* **Use Case:** Gives users complete transparency and instant feedback on their financial status and past activities, complete with direct links to the Arc Block Explorer.

### 🎨 8. Premium UI/UX & Responsive Design
* Built with modern frontend frameworks to ensure a liquid-smooth, highly responsive interface across all desktop and mobile devices.
* 
