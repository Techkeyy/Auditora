// Deploy AuditoraRegistry to Monad. Usage:
//   npm run deploy [-- feeInMon]
// Reads AUDITORA_SIGNER_KEY etc. from .env.local (or the shell environment).
// Defaults: Monad testnet (10143), fee 0.05 MON. Set AUDITORA_CHAIN_ID=143 for mainnet.
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Node doesn't load .env.local the way Next.js does — read it ourselves so
// `npm run deploy` just works. Shell env vars still take precedence.
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const artifact = JSON.parse(
  readFileSync(join(root, "lib", "registry-artifact.json"), "utf8")
);

// Accept the key with or without the 0x prefix (MetaMask exports without it).
let key = (process.env.AUDITORA_SIGNER_KEY || "").trim();
if (/^[0-9a-fA-F]{64}$/.test(key)) key = "0x" + key;
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set AUDITORA_SIGNER_KEY to a funded private key (64 hex chars).");
  process.exit(1);
}

const chain = process.env.AUDITORA_CHAIN_ID === "143" ? monad : monadTestnet;
const rpc = process.env.MONAD_RPC_URL || chain.rpcUrls.default.http[0];
const account = privateKeyToAccount(key);
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

const feeMon = process.argv[2] || "0.05";
const fee = parseEther(feeMon);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer: ${account.address}`);
console.log(`Chain:    ${chain.name} (${chain.id}) via ${rpc}`);
console.log(`Balance:  ${formatEther(balance)} MON`);
console.log(`Request fee: ${feeMon} MON`);
if (balance === 0n) {
  console.error("Deployer has no MON — fund it from the faucet first.");
  process.exit(1);
}

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [fee],
});
console.log(`Deploy tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("Deployment failed:", receipt.status);
  process.exit(1);
}

const explorer =
  chain.blockExplorers?.default?.url || "https://testnet.monadexplorer.com";
console.log(`\nAuditoraRegistry deployed: ${receipt.contractAddress}`);
console.log(`Explorer: ${explorer}/address/${receipt.contractAddress}`);
console.log(`Gas used: ${receipt.gasUsed}`);
console.log(`\nAdd to .env.local:`);
console.log(`AUDITORA_REGISTRY_ADDRESS=${receipt.contractAddress}`);
