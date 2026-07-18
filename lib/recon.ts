import { formatEther, getAddress, type PublicClient } from "viem";
import { publicClient, chainId, chainName } from "./chain";

// The agent's reconnaissance layer. Before a single model sees the code, Auditora
// gathers the live on-chain context that decides whether a bug is theoretical or
// exploitable-right-now: who controls it, what it holds, and what code is really
// running behind the address.

/** EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1. */
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
/** EIP-1967 admin slot: keccak256("eip1967.proxy.admin") - 1. */
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

export type OwnerType =
  | "renounced"
  | "eoa"
  | "contract"
  | "multisig-like"
  | "unknown";

export interface Recon {
  address: string;
  chainId: number;
  chainName: string;
  isContract: boolean;
  verified: boolean;
  contractName?: string;
  /** Proxy → the implementation address the audit should actually target. */
  isProxy: boolean;
  implementation?: string;
  /** Owner/admin discovered via common getters or the EIP-1967 admin slot. */
  owner?: string;
  ownerType: OwnerType;
  /** Native MON currently held — the funds actually at risk. */
  balanceWei: string;
  balanceEth: string;
  /** Human-readable evidence lines the agent will hand to the board + the UI. */
  notes: string[];
}

function slotToAddress(word: string | null | undefined): `0x${string}` | undefined {
  if (!word || word.length < 66) return undefined;
  const addr = "0x" + word.slice(-40);
  if (/^0x0{40}$/.test(addr)) return undefined;
  try {
    return getAddress(addr);
  } catch {
    return undefined;
  }
}

async function readSlotAddress(
  client: PublicClient,
  address: `0x${string}`,
  slot: `0x${string}`
): Promise<`0x${string}` | undefined> {
  try {
    const word = await client.getStorageAt({ address, slot });
    return slotToAddress(word);
  } catch {
    return undefined;
  }
}

/** Etherscan V2 getsourcecode — returns verified flag, name, and proxy/impl. */
async function explorerMeta(address: string, signal: AbortSignal) {
  if (!process.env.ETHERSCAN_API_KEY) return undefined;
  const qs = new URLSearchParams({
    chainid: String(chainId()),
    module: "contract",
    action: "getsourcecode",
    address,
    apikey: process.env.ETHERSCAN_API_KEY,
  });
  try {
    const res = await fetch(`https://api.etherscan.io/v2/api?${qs}`, { signal });
    if (!res.ok) return undefined;
    const data = await res.json();
    const e = Array.isArray(data?.result) ? data.result[0] : undefined;
    if (!e) return undefined;
    return {
      verified:
        Boolean(e.SourceCode) &&
        e.ABI !== "Contract source code not verified",
      name: String(e.ContractName || "").trim() || undefined,
      isProxy: String(e.Proxy) === "1",
      implementation:
        /^0x[0-9a-fA-F]{40}$/.test(e.Implementation || "")
          ? getAddress(e.Implementation)
          : undefined,
    };
  } catch {
    return undefined;
  }
}

/** Try common ownership getters. Returns the first that answers. */
async function readOwner(
  client: PublicClient,
  address: `0x${string}`
): Promise<string | undefined> {
  const fns = ["owner", "admin", "getOwner"] as const;
  for (const name of fns) {
    try {
      const res = await client.readContract({
        address,
        abi: [
          {
            type: "function",
            name,
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "address" }],
          },
        ],
        functionName: name,
      });
      const addr = typeof res === "string" ? res : undefined;
      if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) return getAddress(addr);
    } catch {
      // getter absent or reverted — try the next
    }
  }
  return undefined;
}

async function classifyOwner(
  client: PublicClient,
  owner: string | undefined
): Promise<OwnerType> {
  if (!owner) return "unknown";
  if (/^0x0{40}$/.test(owner)) return "renounced";
  try {
    const code = await client.getCode({ address: owner as `0x${string}` });
    if (!code || code === "0x") return "eoa";
    // A Safe and most multisigs are contracts with substantial code.
    return code.length > 1000 ? "multisig-like" : "contract";
  } catch {
    return "unknown";
  }
}

/**
 * Run reconnaissance on a deployed address. Everything is best-effort: a failed
 * lookup narrows the picture, never blocks the audit.
 */
export async function runRecon(addressRaw: string): Promise<Recon> {
  const address = getAddress(addressRaw.trim());
  const client = publicClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  const notes: string[] = [];
  try {
    const [code, balance, meta] = await Promise.all([
      client.getCode({ address }).catch(() => undefined),
      client.getBalance({ address }).catch(() => 0n),
      explorerMeta(address, controller.signal),
    ]);

    const isContract = Boolean(code && code !== "0x");
    if (!isContract) {
      notes.push("Address holds no code — an EOA or an undeployed/destroyed contract.");
    }

    // Proxy: trust the explorer first, then fall back to reading the 1967 slot.
    let isProxy = meta?.isProxy ?? false;
    let implementation = meta?.implementation;
    if (!implementation) {
      const slotImpl = await readSlotAddress(client, address, EIP1967_IMPL_SLOT);
      if (slotImpl) {
        isProxy = true;
        implementation = slotImpl;
      }
    }
    if (isProxy && implementation) {
      notes.push(
        `Proxy detected — real logic lives at implementation ${implementation}. Auditing the implementation, not the proxy shell.`
      );
    }

    // Owner: common getters, then the EIP-1967 admin slot for proxies.
    let owner = await readOwner(client, address);
    if (!owner) {
      const adminSlot = await readSlotAddress(client, address, EIP1967_ADMIN_SLOT);
      if (adminSlot) owner = adminSlot;
    }
    const ownerType = await classifyOwner(client, owner);
    if (owner) {
      const label =
        ownerType === "renounced"
          ? "ownership renounced (owner = zero address) — admin functions are frozen."
          : ownerType === "eoa"
            ? `controlled by a single EOA (${owner}) — a compromised key drains everything an admin can reach.`
            : ownerType === "multisig-like"
              ? `controlled by a multisig-like contract (${owner}) — higher bar to abuse admin power.`
              : `controlled by a contract (${owner}).`;
      notes.push(`Owner: ${label}`);
    }

    const balanceEth = formatEther(balance ?? 0n);
    if ((balance ?? 0n) > 0n) {
      notes.push(`Holds ${balanceEth} MON right now — live funds at risk.`);
    } else if (isContract) {
      notes.push("Holds 0 MON — no native funds directly at risk (tokens may still be).");
    }

    if (meta?.verified) {
      notes.push(`Verified on ${chainName()}${meta.name ? ` — ${meta.name}` : ""}.`);
    } else if (isContract) {
      notes.push("Unverified on the explorer — auditing deployed bytecode.");
    }

    return {
      address,
      chainId: chainId(),
      chainName: chainName(),
      isContract,
      verified: meta?.verified ?? false,
      contractName: meta?.name,
      isProxy,
      implementation,
      owner,
      ownerType,
      balanceWei: (balance ?? 0n).toString(),
      balanceEth,
      notes,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The compact evidence block injected into the auditor prompt. */
export function reconPromptBlock(r: Recon): string {
  const lines = [
    `Target: ${r.address} on ${r.chainName}`,
    `Contract: ${r.isContract ? "yes" : "no (EOA/undeployed)"}`,
    `Verified: ${r.verified ? "yes" : "no"}${r.contractName ? ` (${r.contractName})` : ""}`,
    r.isProxy
      ? `Proxy: yes → implementation ${r.implementation ?? "unknown"}`
      : "Proxy: no",
    `Owner: ${r.owner ?? "not found"} [${r.ownerType}]`,
    `Native balance at risk: ${r.balanceEth} MON`,
  ];
  return `LIVE ON-CHAIN CONTEXT (gathered by Auditora before this review — use it to judge whether findings are exploitable in practice, and to set severity accordingly):
${lines.map((l) => `- ${l}`).join("\n")}`;
}
