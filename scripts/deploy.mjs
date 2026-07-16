// Deploy ArgusRegistry to Monad. Usage:
//   ARGUS_SIGNER_KEY=0x... node scripts/deploy.mjs [feeInMon]
// Defaults: Monad testnet (10143), fee 0.05 MON. Set ARGUS_CHAIN_ID=143 for mainnet.
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = JSON.parse(
  readFileSync(join(root, "lib", "registry-artifact.json"), "utf8")
);

const key = (process.env.ARGUS_SIGNER_KEY || "").trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set ARGUS_SIGNER_KEY to a funded private key (0x + 64 hex).");
  process.exit(1);
}

const chain = process.env.ARGUS_CHAIN_ID === "143" ? monad : monadTestnet;
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
console.log(`\nArgusRegistry deployed: ${receipt.contractAddress}`);
console.log(`Explorer: ${explorer}/address/${receipt.contractAddress}`);
console.log(`Gas used: ${receipt.gasUsed}`);
console.log(`\nAdd to .env.local:`);
console.log(`ARGUS_REGISTRY_ADDRESS=${receipt.contractAddress}`);
