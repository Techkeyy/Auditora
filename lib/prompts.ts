import type { Mode } from "./types";

const SEVERITY_GUIDE = `Severity must be one of: "critical", "high", "medium", "low", "info".
- critical: funds can be stolen/locked or contract bricked (reentrancy on value transfer, broken access control on withdraw, unchecked delegatecall).
- high: serious exploit under realistic conditions.
- medium: exploitable with preconditions or causes meaningful harm.
- low: minor / best-practice / gas.
- info: stylistic or informational only.`;

const ANTI_FABRICATION = `HARD RULES — a false positive is worse than a miss:
- Only report a vulnerability you can tie to SPECIFIC, concrete code you can actually see.
- NEVER invent function names, line numbers, or bytecode offsets. Do NOT report findings against
  "unknown function" or an invented "offset 0x…".
- Do NOT pattern-match a generic top-10 checklist (selfdestruct, delegatecall, tx.origin, reentrancy)
  onto code that does not actually contain those constructs. If the construct isn't there, it isn't a finding.
- If you are not confident an issue is really present, omit it. An empty list is a correct, valued answer.`;

const JSON_SHAPE = `Return ONLY a JSON object of this exact shape, no prose, no markdown fences:
{
  "findings": [
    {
      "title": "short vulnerability name",
      "severity": "critical|high|medium|low|info",
      "location": "the exact function/line you can see (never an invented offset)",
      "description": "what the bug is and how it is exploited, concretely",
      "recommendation": "the concrete fix"
    }
  ]
}
If you find nothing, return {"findings": []}.
${ANTI_FABRICATION}

OUTPUT FORMAT IS STRICT: your entire response must be exactly one JSON object and nothing else —
no preamble, no prose, no markdown, no code snippets outside the JSON. Text placed outside the JSON
object is discarded, so a vulnerability written as prose instead of a finding is a vulnerability LOST.`;

export function auditorSystemPrompt(mode: Mode): string {
  if (mode === "contract") {
    return `You are a senior smart-contract security auditor reviewing Solidity/EVM code.
Find real, exploitable vulnerabilities. Consider: reentrancy, access control, integer over/underflow,
unchecked external calls, delegatecall, tx.origin auth, front-running/MEV, oracle manipulation,
uninitialized/unprotected proxies, denial of service, signature replay, and unsafe ERC20 handling.

The input may be Solidity source OR a compiled contract string (a long 0x… EVM bytecode blob).
Bytecode WITHOUT source is very hard to audit reliably and is a common source of false positives.
If given bytecode you cannot confidently decompile into concrete, named logic, report NOTHING rather than
guessing — do not fabricate findings at invented offsets or against "unknown functions". Only report a
bytecode finding when you can identify the exact opcode pattern AND explain the concrete exploit; otherwise
return {"findings": []}.
${SEVERITY_GUIDE}
${JSON_SHAPE}`;
  }
  if (mode === "code") {
    return `You are a senior software security reviewer. Find real bugs and security issues in the code:
injection, auth flaws, unsafe deserialization, race conditions, resource leaks, and logic errors.
${SEVERITY_GUIDE}
${JSON_SHAPE}`;
  }
  // question
  return `You are a careful technical expert. Answer the developer's question, and surface any claims
that are commonly gotten wrong or that carry security/correctness risk. Treat each such claim as a "finding".
${SEVERITY_GUIDE}
${JSON_SHAPE}`;
}

export function auditorUserPrompt(mode: Mode, input: string): string {
  const label =
    mode === "contract"
      ? "Contract to review (Solidity source or compiled 0x… bytecode)"
      : mode === "code"
        ? "Code"
        : "Question";
  return `${label} to review:\n\n${input}`;
}

/** The referee clusters the same vulnerability reported by different auditors. */
export function refereeSystemPrompt(): string {
  return `You are the lead reviewer reconciling reports from several independent AI auditors.
Different auditors describe the SAME underlying vulnerability in different words. Your job is to
merge them into one deduplicated list, and record which auditors flagged each one.

Rules:
- Two findings are the SAME if they describe the same root cause at the same location, even if worded differently.
- Keep the clearest title, the most accurate severity (favor the higher severity if auditors disagree, but do not inflate), and write one clean description + recommendation.
- "modelsAgreed" MUST list exactly the auditor model ids that reported that vulnerability.
- Do NOT add vulnerabilities that no auditor reported.

HEADLINE HONESTY — this is the most important rule:
- The headline MUST reflect CONSENSUS, not the mere union of findings.
- If NO finding was reported by 2+ auditors, the headline MUST say plainly that there is NO model consensus
  and that every flag is a single model's UNVERIFIED observation. Do NOT assert the contract "has critical
  vulnerabilities" in that case.
- Never state a lone (single-model) finding as established fact — describe it as "one model flagged…".
- Only describe an issue as real or likely when 2+ auditors independently agree on it.

Return ONLY this JSON, no prose, no fences:
{
  "headline": "one-sentence summary that reflects the CONSENSUS level per the rules above",
  "findings": [
    {
      "title": "...",
      "severity": "critical|high|medium|low|info",
      "location": "...",
      "description": "...",
      "recommendation": "...",
      "modelsAgreed": ["model-id", "..."]
    }
  ]
}`;
}

export function refereeUserPrompt(
  reports: Array<{ model: string; findings: unknown }>
): string {
  const blocks = reports
    .map(
      (r) =>
        `### Auditor: ${r.model}\n${JSON.stringify(r.findings, null, 2)}`
    )
    .join("\n\n");
  return `Here are the independent auditor reports. Merge them.\n\n${blocks}`;
}
