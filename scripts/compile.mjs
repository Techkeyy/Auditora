// Compile contracts/AuditoraRegistry.sol with solc and write the artifact
// (abi + bytecode) to lib/registry-artifact.json for the app and deploy script.
import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "contracts", "AuditoraRegistry.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "AuditoraRegistry.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "metadata"] },
    },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) {
  console.error(`${e.severity}: ${e.formattedMessage}`);
}
if (errors.length) {
  console.error(`\nCompilation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const contract = out.contracts["AuditoraRegistry.sol"]["AuditoraRegistry"];
const artifact = {
  contractName: "AuditoraRegistry",
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
  compiledAt: new Date().toISOString(),
  solcVersion: JSON.parse(contract.metadata).compiler.version,
};

mkdirSync(join(root, "lib"), { recursive: true });
writeFileSync(
  join(root, "lib", "registry-artifact.json"),
  JSON.stringify(artifact, null, 2)
);

console.log(
  `Compiled AuditoraRegistry (solc ${artifact.solcVersion}) → lib/registry-artifact.json`
);
console.log(`Bytecode size: ${(artifact.bytecode.length - 2) / 2} bytes`);
