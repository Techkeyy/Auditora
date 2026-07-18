// Compile + deploy contracts/samples/VulnerableBank.sol to Monad, and fund it
// so Auditora's recon shows real "funds at risk". Usage:
//   node scripts/deploy-vulnerable.mjs [fundMon]
// Reads AUDITORA_SIGNER_KEY etc. from .env.local. Default fund: 0.1 MON.
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local (Node doesn't do this automatically).
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

let key = (process.env.AUDITORA_SIGNER_KEY || "").trim();
if (/^[0-9a-fA-F]{64}$/.test(key)) key = "0x" + key;
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set AUDITORA_SIGNER_KEY (64 hex).");
  process.exit(1);
}

// Compile
const source = readFileSync(
  join(root, "contracts", "samples", "VulnerableBank.sol"),
  "utf8"
);
const input = {
  language: "Solidity",
  sources: { "VulnerableBank.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors ?? []).filter((e) => e.severity === "error");
if (errs.length) {
  errs.forEach((e) => console.error(e.formattedMessage));
  process.exit(1);
}
const c = out.contracts["VulnerableBank.sol"]["VulnerableBank"];
const abi = c.abi;
const bytecode = "0x" + c.evm.bytecode.object;

const chain = process.env.AUDITORA_CHAIN_ID === "143" ? monad : monadTestnet;
const rpc = process.env.MONAD_RPC_URL || chain.rpcUrls.default.http[0];
const account = privateKeyToAccount(key);
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

const fundMon = process.argv[2] || "0.1";
const value = parseEther(fundMon);

const bal = await publicClient.getBalance({ address: account.address });
console.log(`Deployer: ${account.address}`);
console.log(`Chain:    ${chain.name} (${chain.id})`);
console.log(`Balance:  ${formatEther(bal)} MON`);
console.log(`Funding the contract with: ${fundMon} MON (goes in at deploy)`);

// Deploy with value → constructor is payable, so the contract holds funds immediately.
const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [],
  value,
});
console.log(`Deploy tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error("Deploy failed:", receipt.status);
  process.exit(1);
}

const explorer =
  chain.blockExplorers?.default?.url || "https://testnet.monadexplorer.com";
const held = await publicClient.getBalance({ address: receipt.contractAddress });
console.log(`\nVulnerableBank deployed: ${receipt.contractAddress}`);
console.log(`Holds: ${formatEther(held)} MON (funds at risk)`);
console.log(`Owner: ${account.address} (an EOA)`);
console.log(`Explorer: ${explorer}/address/${receipt.contractAddress}`);
console.log(`\n→ Paste this address into Auditora to stress-test the full pipeline.`);
