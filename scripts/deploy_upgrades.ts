import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const PRESERVED_ANS = "0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7";
const PRESERVED_SWAP = "0xD3504e2118b1c7a52cf44947510633562635ee03";

function updateEnvLocalAddresses(updates: Record<string, string>) {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envLocalPath)) return;

  const raw = fs.readFileSync(envLocalPath, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();

  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim());
    if (!match) return line;
    const key = match[1];
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envLocalPath, nextLines.join(eol));
}

async function main() {
  if (network.name !== "arc_mainnet") {
    throw new Error("Refusing to deploy: scripts/deploy_upgrades.ts only runs on arc_mainnet.");
  }

  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);
  if (chainId !== 5042) {
    throw new Error(`Refusing to deploy: connected chain id is ${chainId}, expected 5042.`);
  }

  const deploymentsFile = path.join(process.cwd(), "deployments", "arc-mainnet.json");
  const existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8")) as {
    network: string;
    chainId: number;
    deployer: string;
    usdc: string;
    eurc: string;
    achswapRouter: string;
    achswapFactory: string;
    contracts: Record<string, string>;
    transactions: Record<string, string>;
    previousContracts?: Record<string, string>;
    previousTransactions?: Record<string, string>;
  };

  if (existing.contracts.NexNameService.toLowerCase() !== PRESERVED_ANS.toLowerCase()) {
    throw new Error("Unexpected NexNameService address in deployments/arc-mainnet.json; aborting.");
  }
  if (existing.contracts.NexioSwap.toLowerCase() !== PRESERVED_SWAP.toLowerCase()) {
    throw new Error("Unexpected NexioSwap address in deployments/arc-mainnet.json; aborting.");
  }

  const usdcToken = new ethers.Contract(
    USDC,
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    ethers.provider
  );
  const eurcToken = new ethers.Contract(
    EURC,
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    ethers.provider
  );

  const [usdcSymbol, usdcDecimals, eurcSymbol, eurcDecimals, ansCode] = await Promise.all([
    usdcToken.symbol() as Promise<string>,
    usdcToken.decimals() as Promise<number>,
    eurcToken.symbol() as Promise<string>,
    eurcToken.decimals() as Promise<number>,
    ethers.provider.getCode(PRESERVED_ANS),
  ]);

  if (usdcSymbol !== "USDC" || Number(usdcDecimals) !== 6) {
    throw new Error("Canonical USDC check failed on Arc Mainnet.");
  }
  if (eurcSymbol !== "EURC" || Number(eurcDecimals) !== 6) {
    throw new Error("Canonical EURC check failed on Arc Mainnet.");
  }
  if (!ansCode || ansCode === "0x") {
    throw new Error("Preserved NexNameService has no bytecode on chain 5042; aborting.");
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account found. Set PRIVATE_KEY in the gitignored .env.hardhat file.");
  }
  const deployer = signers[0];
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Native USDC Balance:", ethers.formatUnits(balance, 18));
  console.log("Chain ID:", chainId);

  const fee = await ethers.provider.getFeeData();
  const floor = ethers.parseUnits("20", "gwei");
  const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas > floor ? fee.maxFeePerGas : floor;
  const maxPriorityFeePerGas =
    fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas > 0n
      ? fee.maxPriorityFeePerGas
      : ethers.parseUnits("1", "gwei");
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };

  console.log("Deploying upgraded DailyGM...");
  const dailyGm = await ethers.deployContract("DailyGM", overrides);
  await dailyGm.waitForDeployment();
  const dailyGmReceipt = await dailyGm.deploymentTransaction()?.wait(1);
  const dailyGmAddress = await dailyGm.getAddress();

  console.log("Deploying upgraded NexioVault (EURC)...");
  const eurcVault = await ethers.deployContract("NexioVault", [EURC], overrides);
  await eurcVault.waitForDeployment();
  const eurcVaultReceipt = await eurcVault.deploymentTransaction()?.wait(1);
  const eurcVaultAddress = await eurcVault.getAddress();

  console.log("Deploying upgraded NexioUSDCVault (USDC)...");
  const usdcVault = await ethers.deployContract("NexioUSDCVault", [USDC], overrides);
  await usdcVault.waitForDeployment();
  const usdcVaultReceipt = await usdcVault.deploymentTransaction()?.wait(1);
  const usdcVaultAddress = await usdcVault.getAddress();

  // Verify live bytecode and upgraded view calls on Arc Mainnet
  const [gmCode, eurcVaultCode, usdcVaultCode, effStreak, vaultEurcToken, vaultUsdcToken, eurcNlp, usdcNlp] =
    await Promise.all([
      ethers.provider.getCode(dailyGmAddress),
      ethers.provider.getCode(eurcVaultAddress),
      ethers.provider.getCode(usdcVaultAddress),
      dailyGm.getEffectiveStreak(deployer.address) as Promise<bigint>,
      eurcVault.stablecoin() as Promise<string>,
      usdcVault.usdc() as Promise<string>,
      eurcVault.getPendingNLP(deployer.address) as Promise<bigint>,
      usdcVault.getPendingNLP(deployer.address) as Promise<bigint>,
    ]);

  if (gmCode === "0x" || eurcVaultCode === "0x" || usdcVaultCode === "0x") {
    throw new Error("Post-deployment bytecode check failed!");
  }
  if (vaultEurcToken.toLowerCase() !== EURC.toLowerCase()) {
    throw new Error("NexioVault stablecoin() mismatch!");
  }
  if (vaultUsdcToken.toLowerCase() !== USDC.toLowerCase()) {
    throw new Error("NexioUSDCVault usdc() mismatch!");
  }

  console.log("Verified on-chain views:", {
    effStreak: effStreak.toString(),
    eurcNlp: eurcNlp.toString(),
    usdcNlp: usdcNlp.toString(),
  });

  const updatedDeployment = {
    network: "arc_mainnet",
    chainId,
    deployer: deployer.address,
    usdc: USDC,
    eurc: EURC,
    achswapRouter: existing.achswapRouter,
    achswapFactory: existing.achswapFactory,
    contracts: {
      NexNameService: existing.contracts.NexNameService,
      DailyGM: dailyGmAddress,
      NexioVault: eurcVaultAddress,
      NexioUSDCVault: usdcVaultAddress,
      NexioSwap: existing.contracts.NexioSwap,
    },
    transactions: {
      NexNameService: existing.transactions.NexNameService,
      DailyGM: dailyGmReceipt?.hash ?? dailyGm.deploymentTransaction()?.hash ?? "",
      NexioVault: eurcVaultReceipt?.hash ?? eurcVault.deploymentTransaction()?.hash ?? "",
      NexioUSDCVault: usdcVaultReceipt?.hash ?? usdcVault.deploymentTransaction()?.hash ?? "",
      NexioSwap: existing.transactions.NexioSwap,
    },
    previousContracts: {
      ...(existing.previousContracts ?? {}),
      DailyGM: existing.contracts.DailyGM,
      NexioVault: existing.contracts.NexioVault,
      NexioUSDCVault: existing.contracts.NexioUSDCVault,
    },
    previousTransactions: {
      ...(existing.previousTransactions ?? {}),
      DailyGM: existing.transactions.DailyGM,
      NexioVault: existing.transactions.NexioVault,
      NexioUSDCVault: existing.transactions.NexioUSDCVault,
    },
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(updatedDeployment, null, 2) + "\n");

  updateEnvLocalAddresses({
    NEXT_PUBLIC_DAILY_GM_ADDRESS: dailyGmAddress,
    NEXT_PUBLIC_EURC_VAULT_ADDRESS: eurcVaultAddress,
    NEXT_PUBLIC_USDC_VAULT_ADDRESS: usdcVaultAddress,
  });

  console.log(JSON.stringify(updatedDeployment, null, 2));
  console.log("Updated deployments/arc-mainnet.json and .env.local public contract addresses.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Upgrade deployment failed";
  console.error(message);
  process.exit(1);
});
