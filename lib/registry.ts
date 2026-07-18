import { keccak256, toHex, type Abi } from "viem";
import artifact from "./registry-artifact.json";
import {
  addressUrl,
  canAttest,
  chainId,
  publicClient,
  registryAddress,
  txUrl,
  walletClient,
} from "./chain";
import type {
  AttestationInfo,
  AuditResult,
  PostureLevel,
  RegistryAttestation,
} from "./types";

export const REGISTRY_ABI = artifact.abi as Abi;

/** requestId sentinel — attestation not tied to a paid onchain request. */
export const NO_REQUEST = 2n ** 256n - 1n;

const POSTURE_CODE: Record<PostureLevel, number> = {
  clean: 0,
  "no-consensus": 1,
  corroborated: 2,
};
const POSTURE_LEVEL: PostureLevel[] = ["clean", "no-consensus", "corroborated"];

/**
 * The canonical report the onchain hash commits to. Deterministic field order,
 * no volatile fields — anyone holding this JSON can re-hash it and check it
 * against the registry. Returned to the caller alongside the attestation.
 */
export function canonicalReport(result: AuditResult, target: string): string {
  return JSON.stringify({
    v: 1,
    target: target.toLowerCase(),
    chainId: chainId(),
    posture: result.posture.level,
    headline: result.headline,
    models: result.auditors.map((a) => a.model),
    challenger: result.meta.refereeModel,
    findings: result.findings.map((f) => ({
      title: f.title,
      severity: f.severity,
      location: f.location,
      status: f.status,
      verdict: f.challenge.verdict,
      origin: f.origin,
      auditorsClaimed: f.auditorsClaimed,
    })),
  });
}

export function reportHashOf(canonical: string): `0x${string}` {
  return keccak256(toHex(canonical));
}

export interface AttestOutcome {
  info: AttestationInfo;
  canonical: string;
}

/** Anchor a board verdict for `target` on the Monad registry. */
export async function attestAudit(
  result: AuditResult,
  target: string,
  requestId: bigint = NO_REQUEST
): Promise<AttestOutcome> {
  const registry = registryAddress();
  const wallet = walletClient();
  if (!registry || !wallet) {
    throw new Error(
      "Registry not configured — set AUDITORA_REGISTRY_ADDRESS and AUDITORA_SIGNER_KEY."
    );
  }

  const canonical = canonicalReport(result, target);
  const reportHash = reportHashOf(canonical);
  // Onchain schema stays stable: "corroborated" = findings that SURVIVED the
  // Challenger (confirmed), "lone" = disputed. Dismissed findings (false
  // positives the Challenger rejected) are not attested as risks at all.
  const corroborated = result.findings.filter(
    (f) => f.status === "confirmed"
  ).length;
  const lone = result.findings.filter((f) => f.status === "contested").length;

  const hash = await wallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [
      target as `0x${string}`,
      reportHash,
      POSTURE_CODE[result.posture.level],
      corroborated,
      lone,
      requestId,
    ],
    chain: wallet.chain,
    account: wallet.account!,
  });

  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`attest tx reverted: ${hash}`);
  }

  return {
    canonical,
    info: {
      txHash: hash,
      explorerUrl: txUrl(hash),
      reportHash,
      registry,
      chainId: chainId(),
    },
  };
}

interface RawAttestation {
  codehash: `0x${string}`;
  reportHash: `0x${string}`;
  posture: number;
  corroborated: number;
  lone: number;
  timestamp: bigint;
  attester: `0x${string}`;
}

function toRecord(
  target: string,
  a: RawAttestation,
  currentCodehash: `0x${string}` | undefined
): RegistryAttestation {
  return {
    target,
    codehash: a.codehash,
    reportHash: a.reportHash,
    posture: POSTURE_LEVEL[a.posture] ?? "no-consensus",
    corroborated: Number(a.corroborated),
    lone: Number(a.lone),
    timestamp: Number(a.timestamp),
    fresh: currentCodehash !== undefined && currentCodehash === a.codehash,
  };
}

export interface RegistryLookup {
  configured: boolean;
  registry?: string;
  registryUrl?: string;
  count: number;
  attestations: RegistryAttestation[];
}

/** Everything the registry knows about `target`, newest first. */
export async function lookupAttestations(
  target: string
): Promise<RegistryLookup> {
  const registry = registryAddress();
  if (!registry) return { configured: false, count: 0, attestations: [] };

  const client = publicClient();
  const count = (await client.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "attestationCount",
    args: [target as `0x${string}`],
  })) as bigint;

  if (count === 0n) {
    return {
      configured: true,
      registry,
      registryUrl: addressUrl(registry),
      count: 0,
      attestations: [],
    };
  }

  const page = (await client.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "getAttestations",
    args: [target as `0x${string}`, 0n, count],
  })) as RawAttestation[];

  // Freshness = does the CURRENT deployed code still match what was audited?
  let currentCodehash: `0x${string}` | undefined;
  try {
    const code = await client.getCode({ address: target as `0x${string}` });
    currentCodehash = code && code !== "0x" ? keccak256(code) : undefined;
  } catch {
    currentCodehash = undefined;
  }

  const records = page
    .map((a) => toRecord(target, a, currentCodehash))
    .reverse();

  return {
    configured: true,
    registry,
    registryUrl: addressUrl(registry),
    count: Number(count),
    attestations: records,
  };
}

export interface OpenRequest {
  id: string;
  target: string;
  requester: string;
  paidWei: string;
}

/** Open (unfulfilled) paid audit requests from the onchain queue. */
export async function fetchOpenRequests(limit = 20): Promise<OpenRequest[]> {
  const registry = registryAddress();
  if (!registry) return [];
  const [ids, reqs] = (await publicClient().readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "openRequests",
    args: [BigInt(limit)],
  })) as [bigint[], Array<{ target: string; requester: string; paid: bigint; fulfilled: boolean }>];

  return ids.map((id, i) => ({
    id: id.toString(),
    target: reqs[i].target,
    requester: reqs[i].requester,
    paidWei: reqs[i].paid.toString(),
  }));
}

export { canAttest };
