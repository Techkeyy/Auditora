import type { SourceMeta } from "./types";
import { chainId, chainName, publicClient } from "./chain";

// A bare EVM contract address, nothing else on the line.
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(input: string): boolean {
  return ADDRESS_RE.test(input.trim());
}

/** Etherscan's V2 multichain endpoint — one host + key for every chain,
 *  including Monad (143) and Monad testnet (10143). */
async function etherscan(
  params: Record<string, string>,
  signal: AbortSignal
): Promise<any> {
  const qs = new URLSearchParams({
    chainid: String(chainId()),
    apikey: process.env.ETHERSCAN_API_KEY || "",
    ...params,
  });
  const res = await fetch(`https://api.etherscan.io/v2/api?${qs}`, { signal });
  if (!res.ok) throw new Error(`explorer HTTP ${res.status}`);
  return res.json();
}

/**
 * Etherscan's `SourceCode` field is one of three shapes:
 *  - raw Solidity,
 *  - a JSON sources map `{ "F.sol": { content } }` (legacy multi-file), or
 *  - a standard-json-input blob wrapped in an extra pair of braces `{{ ... }}`.
 * Flatten any of them into a single readable Solidity string for the swarm.
 */
function flattenSource(sourceCode: string): string {
  const s = sourceCode.trim();
  const unwrapped = s.startsWith("{{") && s.endsWith("}}") ? s.slice(1, -1) : s;
  if (unwrapped.startsWith("{")) {
    try {
      const parsed = JSON.parse(unwrapped);
      const sources = parsed.sources ?? parsed;
      const parts: string[] = [];
      for (const [file, obj] of Object.entries<any>(sources)) {
        const content = obj?.content;
        if (typeof content === "string") {
          parts.push(`// ===== ${file} =====\n${content}`);
        }
      }
      if (parts.length) return parts.join("\n\n");
    } catch {
      // not JSON after all — fall through and use the raw string
    }
  }
  return sourceCode;
}

export interface Resolved {
  input: string;
  source: SourceMeta;
}

/** Last-resort code fetch straight from the Monad RPC — needs no API key. */
async function rpcBytecode(address: string): Promise<string | undefined> {
  try {
    const code = await publicClient().getCode({
      address: address as `0x${string}`,
    });
    return code && code !== "0x" && code.length > 4 ? code : undefined;
  } catch {
    return undefined;
  }
}

function bytecodeResult(
  address: string,
  bytecode: string,
  base: { address: string; chainId: number }
): Resolved {
  return {
    input: bytecode,
    source: {
      ...base,
      kind: "address-bytecode",
      note: `Contract is unverified on ${chainName()} — auditing raw deployed bytecode with no source. Findings are low-confidence.`,
    },
  };
}

/**
 * If the input is a bare contract address, fetch its REAL code from Monad —
 * verified source via the explorer when possible, raw deployed bytecode via
 * RPC otherwise — so the swarm audits actual code instead of being quizzed
 * on whether it remembers the address. Non-addresses pass through as "inline".
 */
export async function resolveContractInput(input: string): Promise<Resolved> {
  const address = input.trim();
  if (!isAddress(address)) {
    return { input, source: { kind: "inline" } };
  }

  const chain = chainName();
  const base = { address, chainId: chainId() };

  // Without an explorer key we can still audit the deployed bytecode via RPC.
  if (!process.env.ETHERSCAN_API_KEY) {
    const bytecode = await rpcBytecode(address);
    if (bytecode) return bytecodeResult(address, bytecode, base);
    return {
      input,
      source: {
        ...base,
        kind: "address-unfetched",
        note: `No contract code found at this address on ${chain} — it may be an EOA, or on the other Monad network (set ARGUS_CHAIN_ID). Set ETHERSCAN_API_KEY to fetch verified source.`,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const data = await etherscan(
      { module: "contract", action: "getsourcecode", address },
      controller.signal
    );
    const entry = Array.isArray(data?.result) ? data.result[0] : undefined;
    const verified =
      entry &&
      entry.SourceCode &&
      entry.ABI !== "Contract source code not verified";

    if (verified) {
      const name = String(entry.ContractName || "").trim() || undefined;
      return {
        input: flattenSource(String(entry.SourceCode)),
        source: {
          ...base,
          kind: "address-source",
          contractName: name,
          note: `Verified source fetched from ${chain}${name ? ` — ${name}` : ""}. The swarm audited the real code, not a guess from the address.`,
        },
      };
    }

    // Unverified on the explorer: fall back to raw deployed bytecode via RPC.
    const bytecode = await rpcBytecode(address);
    if (bytecode) return bytecodeResult(address, bytecode, base);

    return {
      input,
      source: {
        ...base,
        kind: "address-unfetched",
        note: `No contract code found at this address on ${chain} — it may be an EOA, self-destructed, or on the other Monad network (set ARGUS_CHAIN_ID).`,
      },
    };
  } catch (err) {
    // Explorer unreachable — the RPC bytecode path still gives a real audit.
    const bytecode = await rpcBytecode(address);
    if (bytecode) return bytecodeResult(address, bytecode, base);

    const msg = err instanceof Error ? err.message : "fetch failed";
    return {
      input,
      source: {
        ...base,
        kind: "address-unfetched",
        note: `Couldn't reach the explorer or RPC (${msg}). Auditing a bare address from model memory is unreliable — paste source for a real audit.`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
