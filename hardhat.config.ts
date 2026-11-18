import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config({ path: ".env.hardhat" });
dotenv.config();

const rawPrivateKey = process.env.PRIVATE_KEY?.trim() ?? "";
const normalizedKey = /^[0-9a-fA-F]{64}$/.test(rawPrivateKey)
  ? `0x${rawPrivateKey}`
  : rawPrivateKey;
const accounts = /^0x[0-9a-fA-F]{64}$/.test(normalizedKey) ? [normalizedKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arc_mainnet: {
      url: "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts,
    },
  },
};

export default config;
