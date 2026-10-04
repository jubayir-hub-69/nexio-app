import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY?.trim() ?? "";
const accounts = /^0x[0-9a-fA-F]{64}$/.test(privateKey) ? [privateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arc_testnet: {
      url: "https://rpc.testnet.arc.io",
      chainId: 5042002,
      accounts,
    },
    arc_mainnet: {
      url: "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts,
    },
  },
};

export default config;
