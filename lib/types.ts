// Shared types for the Flex audit engine.

export type Mode = "contract" | "code" | "question";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Consensus = "confirmed" | "contested" | "lone";

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

/** A finding after the referee merges the same vuln across auditors. */
export interface MergedFinding {
  id: string;
  title: string;
  severity: Severity;
  location: string;
  description: string;
  recommendation: string;
  /** Which auditor models independently flagged this vuln. */
  modelsAgreed: string[];
  modelsTotal: number;
  consensus: Consensus;
}

/** Real spend for one model call, as accounted by the gateway. */
export interface CallCost {
  usd: number;
  promptTokens: number;
  completionTokens: number;
}

/** The honest cost receipt for a whole swarm run. */
export interface Receipt {
  calls: number;
  totalUsd: number;
  promptTokens: number;
  completionTokens: number;
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
