import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const ROUTER = "0x52FE40c00530db2e43d01652f903870571A14AFD";
const FACTORY = "0xb0C2B0acb9c13079dDd871eDaF43Aabf6e88C530";

async function main() {
  if (network.name !== "arc_mainnet") {
    throw new Error("Refusing to deploy: scripts/deploy_mainnet.ts only runs on arc_mainnet.");
  }

  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);
  if (chainId !== 5042) {
    throw new Error(`Refusing to deploy: connected chain id is ${chainId}, expected 5042.`);
  }

  const usdc = new ethers.Contract(USDC, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], ethers.provider);
  const eurc = new ethers.Contract(EURC, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], ethers.provider);
  const router = new ethers.Contract(ROUTER, ["function factory() view returns (address)"], ethers.provider);

  const [usdcSymbol, usdcDecimals, eurcSymbol, eurcDecimals, routerFactory] = await Promise.all([
    usdc.symbol() as Promise<string>,
    usdc.decimals() as Promise<number>,
    eurc.symbol() as Promise<string>,
    eurc.decimals() as Promise<number>,
    router.factory() as Promise<string>,
  ]);

  if (usdcSymbol !== "USDC" || Number(usdcDecimals) !== 6) {
    throw new Error("USDC token at the official address did not report symbol USDC and 6 decimals.");
  }
  if (eurcSymbol !== "EURC" || Number(eurcDecimals) !== 6) {
    throw new Error("EURC token at the official address did not report symbol EURC and 6 decimals.");
  }
  if (routerFactory.toLowerCase() !== FACTORY.toLowerCase()) {
    throw new Error("Achswap router factory() does not match the official factory. Aborting.");
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account. Set PRIVATE_KEY in the gitignored .env file.");
  }
  const deployer = signers[0];
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer", deployer.address);
  console.log("Native USDC", ethers.formatUnits(balance, 18));
  console.log("Chain", chainId);

  const minimum = ethers.parseUnits("0.05", 18);
  if (balance < minimum) {
    throw new Error("Deployer USDC balance is below 0.05. Refusing to broadcast.");
  }

  const fee = await ethers.provider.getFeeData();
  const floor = ethers.parseUnits("20", "gwei");
  const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas > floor ? fee.maxFeePerGas : floor;
  const maxPriorityFeePerGas = ethers.parseUnits("1", "gwei");
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };
  console.log("maxFeePerGas", maxFeePerGas.toString());
  console.log("maxPriorityFeePerGas", maxPriorityFeePerGas.toString());

  const ans = await ethers.deployContract("NexNameService", overrides);
  await ans.waitForDeployment();
  const dailyGm = await ethers.deployContract("DailyGM", overrides);
  await dailyGm.waitForDeployment();
  const eurcVault = await ethers.deployContract("NexioVault", [EURC], overrides);
  await eurcVault.waitForDeployment();
  const usdcVault = await ethers.deployContract("NexioUSDCVault", [USDC], overrides);
  await usdcVault.waitForDeployment();
  const swap = await ethers.deployContract("NexioSwap", [USDC, EURC, ROUTER, FACTORY], overrides);
  await swap.waitForDeployment();

  const deployed = {
    network: "arc_mainnet",
    chainId,
    deployer: deployer.address,
    usdc: USDC,
    eurc: EURC,
    achswapRouter: ROUTER,
    achswapFactory: FACTORY,
    contracts: {
      NexNameService: await ans.getAddress(),
      DailyGM: await dailyGm.getAddress(),
      NexioVault: await eurcVault.getAddress(),
      NexioUSDCVault: await usdcVault.getAddress(),
      NexioSwap: await swap.getAddress(),
    },
    transactions: {
      NexNameService: ans.deploymentTransaction()?.hash ?? "",
      DailyGM: dailyGm.deploymentTransaction()?.hash ?? "",
      NexioVault: eurcVault.deploymentTransaction()?.hash ?? "",
      NexioUSDCVault: usdcVault.deploymentTransaction()?.hash ?? "",
      NexioSwap: swap.deploymentTransaction()?.hash ?? "",
    },
  };

  const outDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "arc-mainnet.json");
  fs.writeFileSync(outFile, JSON.stringify(deployed, null, 2));
  console.log(JSON.stringify(deployed, null, 2));
  console.log("Wrote", outFile);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Deployment failed";
  console.error(message);
  process.exit(1);
});
