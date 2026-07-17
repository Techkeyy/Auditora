// Shared types for the Auditora audit engine.
import type { Recon } from "./recon";

export type Mode = "contract" | "code" | "question";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** The Challenger's adversarial ruling on one finding. */
export type ChallengeVerdict = "upheld" | "disputed" | "rejected";

/** The Judge's deterministic status, derived from the Challenger's verdict. */
export type FindingStatus = "confirmed" | "contested" | "dismissed";

/** A single finding as reported by one auditor model. */
export interface RawFinding {
  title: string;
  severity: Severity;
  location: string;
  description: string;
  recommendation: string;
}

/** What one auditor returned (or failed to return). */
export interface AuditorResult {
  model: string;
  provider: string;
  findings: RawFinding[];
  raw: string;
  error?: string;
  cost?: CallCost;
}

/** The Challenger's ruling on a finding: does it survive an attack? */
export interface Challenge {
  verdict: ChallengeVerdict;
  rationale: string;
}

/** A finding after it has been through the review board: raised by the
 *  Auditor(s) (or the Challenger itself), attacked by the Challenger, and
 *  given a deterministic status by the Judge. */
export interface MergedFinding {
  id: string;
  title: string;
  severity: Severity;
  location: string;
  description: string;
  recommendation: string;
  /** Who first raised it. */
  origin: "auditor" | "challenger";
  /** Which auditor models raised it (empty when the Challenger found it). */
  auditorsClaimed: string[];
  /** The Challenger's adversarial ruling. */
  challenge: Challenge;
  /** The Judge's deterministic call, derived from the challenge verdict. */
  status: FindingStatus;
}

/** Spend for one model call. `estimated` = derived from tokens, not gateway-exact. */
export interface CallCost {
  usd: number;
  promptTokens: number;
  completionTokens: number;
  estimated?: boolean;
}

/** The honest cost receipt for a whole swarm run. */
export interface Receipt {
  calls: number;
  totalUsd: number;
  promptTokens: number;
  completionTokens: number;
  /** True when any call's cost was estimated from tokens rather than gateway-exact. */
  estimated: boolean;
}

export type PostureLevel = "clean" | "no-consensus" | "corroborated";

/** Data-driven honesty line, computed from consensus — never from model prose. */
export interface Posture {
  level: PostureLevel;
  line: string;
}

/** How the audited code was obtained — so the UI can be honest about it.
 *  address-* means we resolved a bare on-chain address to real code. */
export type SourceKind =
  | "inline"
  | "address-source"
  | "address-bytecode"
  | "address-unfetched";

export interface SourceMeta {
  kind: SourceKind;
  address?: string;
  chainId?: number;
  contractName?: string;
  note?: string;
}

/** Proof that this audit's verdict was anchored to the Monad registry. */
export interface AttestationInfo {
  txHash: string;
  explorerUrl: string;
  reportHash: string;
  registry: string;
  chainId: number;
}

export interface AuditResult {
  mode: Mode;
  headline: string;
  posture: Posture;
  findings: MergedFinding[];
  auditors: Array<Omit<AuditorResult, "cost"> & { costLabel?: string }>;
  receipt: Receipt;
  meta: {
    durationMs: number;
    usedMock: boolean;
    refereeModel: string;
    bytecodeMode: boolean;
    source: SourceMeta;
    recon?: Recon;
    attestation?: AttestationInfo;
    attestError?: string;
  };
}

/** One onchain attestation record, as read back from the registry. */
export interface RegistryAttestation {
  target: string;
  codehash: string;
  reportHash: string;
  posture: PostureLevel;
  corroborated: number;
  lone: number;
  timestamp: number;
  /** Does the contract's CURRENT codehash still match the audited one? */
  fresh: boolean;
}
