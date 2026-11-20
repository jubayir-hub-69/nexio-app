import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

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
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
        nextLines.splice(nextLines.length - 1, 0, `${key}=${val}`);
      } else {
        nextLines.push(`${key}=${val}`);
      }
    }
  }

  fs.writeFileSync(envLocalPath, nextLines.join(eol));
}

async function main() {
  if (network.name !== "arc_mainnet") {
    throw new Error("Refusing to deploy: scripts/deploy_address_book.ts only runs on arc_mainnet.");
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

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account found. Set PRIVATE_KEY in .env.hardhat.");
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

  console.log("Deploying NexioAddressBook to Arc Mainnet (5042)...");
  const addressBook = await ethers.deployContract("NexioAddressBook", {
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await addressBook.waitForDeployment();
  const receipt = await addressBook.deploymentTransaction()?.wait(1);
  const addressBookAddress = await addressBook.getAddress();
  const txHash = receipt?.hash ?? addressBook.deploymentTransaction()?.hash ?? "";

  // Verify live bytecode & view calls on Arc Mainnet
  const [code, maxContacts, count] = await Promise.all([
    ethers.provider.getCode(addressBookAddress),
    addressBook.MAX_CONTACTS_PER_WALLET() as Promise<bigint>,
    addressBook.getContactCount(deployer.address) as Promise<bigint>,
  ]);

  if (!code || code === "0x") {
    throw new Error("Post-deployment bytecode check failed for NexioAddressBook.");
  }
  if (maxContacts !== 100n) {
    throw new Error(`Unexpected MAX_CONTACTS_PER_WALLET: ${maxContacts.toString()}`);
  }

  console.log("Verified NexioAddressBook:", {
    address: addressBookAddress,
    txHash,
    maxContacts: maxContacts.toString(),
    initialCount: count.toString(),
  });

  const updatedDeployment = {
    ...existing,
    contracts: {
      ...existing.contracts,
      NexioAddressBook: addressBookAddress,
    },
    transactions: {
      ...existing.transactions,
      NexioAddressBook: txHash,
    },
  };

  fs.writeFileSync(deploymentsFile, JSON.stringify(updatedDeployment, null, 2) + "\n");
  updateEnvLocalAddresses({
    NEXT_PUBLIC_ADDRESS_BOOK_ADDRESS: addressBookAddress,
  });

  console.log("Updated deployments/arc-mainnet.json and .env.local with NEXT_PUBLIC_ADDRESS_BOOK_ADDRESS.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "NexioAddressBook deployment failed";
  console.error(message);
  process.exit(1);
});
