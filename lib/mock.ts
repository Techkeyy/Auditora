import { providerOf } from "./gateway";
import type { AuditorResult, RawFinding } from "./types";

// Canned auditor outputs so the whole app works with no API key.
// Modeled on the VulnerableVault.sol sample: a reentrancy all three catch,
// a tx.origin auth two catch, and a lone flag only one raises.

const A_GPT: RawFinding[] = [
  {
    title: "Reentrancy in withdraw()",
    severity: "critical",
    location: "withdraw()",
    description:
      "State is updated after the external call. An attacker contract can re-enter withdraw() during the .call and drain the vault before balances[msg.sender] is zeroed.",
    recommendation:
      "Apply checks-effects-interactions: zero the balance before the external call, or use a reentrancy guard.",
  },
  {
    title: "Authentication via tx.origin",
    severity: "high",
    location: "onlyOwner modifier",
    description:
      "Using tx.origin for authorization lets a malicious intermediate contract impersonate the owner via phishing.",
    recommendation: "Use msg.sender for access control, not tx.origin.",
  },
  {
    title: "Unbounded loop in distribute()",
    severity: "medium",
    location: "distribute()",
    description:
      "Iterating over an unbounded users array can exceed the block gas limit, permanently bricking distribution.",
    recommendation: "Use a pull-payment pattern or paginate distribution.",
  },
];

const B_CLAUDE: RawFinding[] = [
  {
    title: "Reentrancy allows draining of funds",
    severity: "critical",
    location: "withdraw() external call",
    description:
      "The contract sends ETH before decrementing the caller's balance, enabling a classic reentrancy drain.",
    recommendation:
      "Update balances before transferring; consider OpenZeppelin ReentrancyGuard.",
  },
  {
    title: "tx.origin used for owner check",
    severity: "high",
    location: "onlyOwner",
    description:
      "tx.origin authentication is phishable and should never gate privileged actions.",
    recommendation: "Replace tx.origin with msg.sender.",
  },
];

const C_DEEPSEEK: RawFinding[] = [
  {
    title: "Reentrancy in ETH withdrawal",
    severity: "critical",
    location: "withdraw()",
    description:
      "External call precedes state update, allowing recursive withdrawal.",
    recommendation: "Follow checks-effects-interactions.",
  },
  {
    title: "Missing zero-address check in setOwner()",
    severity: "low",
    location: "setOwner()",
    description:
      "setOwner() does not validate the new owner, so ownership can be set to address(0), locking admin functions.",
    recommendation: "require(newOwner != address(0)).",
  },
];

/** Map the three canned finding-sets onto whatever models are configured. */
export function mockAuditors(models: string[]): AuditorResult[] {
  const [m0, m1, m2] = padModels(models);
  const sets = [A_GPT, B_CLAUDE, C_DEEPSEEK];
  return [m0, m1, m2].map((model, i) => ({
    model,
    provider: providerOf(model),
    findings: sets[i],
    raw: JSON.stringify({ findings: sets[i] }),
  }));
}

// Deterministic board result for mock mode (mirrors what the Challenger + Judge
// produce): findings raised by auditors, stress-tested, some upheld, one rejected.
export function mockMerged(models: string[]) {
  const [m0, m1, m2] = padModels(models);
  return {
    headline:
      "Reentrancy in withdraw() survived challenge — funds are drainable. One tx.origin issue disputed; a claimed overflow was rejected as a false positive.",
    findings: [
      {
        id: "F-01",
        title: "Reentrancy in withdraw() — funds drainable",
        severity: "critical" as const,
        location: "withdraw()",
        description:
          "ETH is sent via low-level call before balances[msg.sender] is zeroed, so an attacker contract can re-enter and repeatedly withdraw until the vault is empty.",
        recommendation:
          "Apply checks-effects-interactions (zero the balance before the call) and add a reentrancy guard.",
        origin: "auditor" as const,
        auditorsClaimed: [m0, m1, m2],
        challenge: {
          verdict: "upheld" as const,
          rationale:
            "Tried to find a guard or a state update before the call — there is none; the external call precedes the balance write, so re-entry is reachable.",
        },
        status: "confirmed" as const,
      },
      {
        id: "F-02",
        title: "Authentication via tx.origin",
        severity: "high" as const,
        location: "onlyOwner modifier",
        description:
          "Privileged actions are gated by tx.origin, which is phishable: a malicious contract the owner interacts with can impersonate them.",
        recommendation: "Use msg.sender for authorization.",
        origin: "auditor" as const,
        auditorsClaimed: [m0, m1],
        challenge: {
          verdict: "disputed" as const,
          rationale:
            "Real anti-pattern, but exploitation needs the owner to be phished into calling a malicious contract — conditional, so not confirmed.",
        },
        status: "contested" as const,
      },
      {
        id: "F-03",
        title: "Integer overflow in distribute()",
        severity: "medium" as const,
        location: "distribute()",
        description:
          "One auditor claimed an unchecked arithmetic overflow when summing shares.",
        recommendation: "—",
        origin: "auditor" as const,
        auditorsClaimed: [m0],
        challenge: {
          verdict: "rejected" as const,
          rationale:
            "False positive: the contract is Solidity ^0.8, where arithmetic reverts on overflow by default — the claimed path cannot occur.",
        },
        status: "dismissed" as const,
      },
      {
        id: "F-04",
        title: "Missing zero-address check in setOwner()",
        severity: "low" as const,
        location: "setOwner()",
        description:
          "setOwner() does not validate the new owner; ownership can be set to address(0), locking admin functions. Found by the Challenger, missed by the auditors.",
        recommendation: "require(newOwner != address(0)).",
        origin: "challenger" as const,
        auditorsClaimed: [],
        challenge: {
          verdict: "disputed" as const,
          rationale:
            "Caught on the Challenger's own pass; low impact and only reachable by the owner themselves, so flagged for review rather than confirmed.",
        },
        status: "contested" as const,
      },
    ],
  };
}

function padModels(models: string[]): [string, string, string] {
  const fallback = [
    "openai/gpt-4.1",
    "google/gemini-2.5-pro",
    "deepseek/deepseek-chat",
  ];
  return [models[0] ?? fallback[0], models[1] ?? fallback[1], models[2] ?? fallback[2]];
}
