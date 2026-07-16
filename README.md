# Auditora — the audit layer of Monad

**Paste any Monad contract address → three independent AI auditors review the real deployed code → the consensus verdict is attested onchain, bound to the contract's codehash.**

Built for the **Spark Hackathon 2026** (BuildAnything · Monad).

---

## The problem (mine, specifically)

I audit contracts constantly — before bug bounties, before integrating a protocol, before touching anything with money in it. Two things are broken about that workflow:

1. **A single AI auditor answers in the same confident voice whether it is certain or guessing.** The dangerous misses are the quiet ones — the vulnerability it never mentions, and the plausible-sounding one it invents.
2. **Even when I've done the work, the result dies in a chat log.** There is no public place where "this exact bytecode was reviewed, this was the verdict" lives — so everyone re-audits the same contracts from zero, and nobody can tell an audited contract from an unaudited one.

## The solution

Auditora fixes both halves:

- **The swarm.** Your contract — or the real code resolved from a bare Monad address — goes to **three models from three providers at once**; a fourth-family referee merges duplicates and records who flagged what. Only findings corroborated by **2+ independent models** count. Disagreement is the signal.
- **The registry.** The verdict is hashed and attested to `AuditoraRegistry` on Monad, bound to the target's `EXTCODEHASH` at audit time. Anyone can look up any address — and if the code at that address ever changes, the attestation **goes stale automatically**. No trust in us required.
- **The business model, onchain.** `requestAudit(target)` takes a small MON fee and queues any deployed contract for a swarm audit; fulfillment marks the request done in the same attestation. Pay-per-audit, no accounts.

## How to read a result

| Verdict | Meaning | Trust |
| --- | --- | --- |
| **Corroborated** | flagged by 2+ auditors independently | real risk — act on it |
| **Unverified (lone)** | one model only | a lead to check, or noise — collapsed by default |
| **No consensus** | nothing corroborated | on sound code, the expected result |

An attestation records exactly what the swarm concluded and when. It is **not** a certificate of safety — models can share blind spots. Auditora is a first-pass triage layer, loudest exactly where it should be: when the auditors disagree.

## Architecture

```
0x… address on Monad
   │
   ▼  resolve REAL code — verified source (Etherscan V2) or deployed bytecode (RPC)
   │
   ├─►  auditor A (OpenAI)   ┐
   ├─►  auditor B (Google)   ├─ parallel, via one OpenRouter key
   └─►  auditor C (DeepSeek) ┘
   │
   ▼  structured findings (JSON) from each
   │
referee (Qwen — a 4th family)  merges duplicates, records who flagged what
   │
   ▼
verdict ──► keccak256(canonical report) ──► AuditoraRegistry.attest() on Monad
```

- **Contract:** [`contracts/AuditoraRegistry.sol`](contracts/AuditoraRegistry.sol) — attestations bound to codehash, paid request queue, freshness check (`latest()` returns whether the current codehash still matches).
- **App:** Next.js (App Router) + TypeScript; chain access via viem; models via any OpenAI-compatible gateway (OpenRouter by default).
- **Honesty rails:** posture computed from consensus data, never from model prose; bytecode-only audits are labelled low-confidence; mock runs are never attested; every run shows its real USD cost.

## Getting started

```bash
npm install
cp .env.example .env.local        # add your OpenRouter key

npm run compile                   # solc → lib/registry-artifact.json
AUDITORA_SIGNER_KEY=0x… npm run deploy   # deploy AuditoraRegistry to Monad testnet
# put the printed address in .env.local as AUDITORA_REGISTRY_ADDRESS

npm run dev                       # http://localhost:3000
```

With no key set (or `AUDITORA_FORCE_MOCK=1`), Auditora runs in **mock mode** against canned data so you can explore the interface offline. Live audits of pasted source need only the OpenRouter key; auditing by address and onchain attestation need the Monad bits.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | one key for every model family (required for live audits) |
| `AUDITORA_AUDITORS` | comma-separated auditor slugs (default: GPT-4.1, Gemini 2.5 Pro, DeepSeek) |
| `AUDITORA_REFEREE` | reconciling model (default: Qwen3 Max — a fourth family) |
| `AUDITORA_CHAIN_ID` | `10143` Monad testnet (default) · `143` mainnet |
| `AUDITORA_REGISTRY_ADDRESS` | deployed `AuditoraRegistry` address |
| `AUDITORA_SIGNER_KEY` | attester wallet key (needs a little MON for gas) |
| `ETHERSCAN_API_KEY` | optional — fetches *verified source* for addresses; without it Auditora audits raw deployed bytecode via RPC |
| `AUDITORA_FORCE_MOCK` | `1` forces mock mode (demo-safety switch) |

## API

- `POST /api/audit` `{mode, input}` — run the swarm; address audits on Monad are attested automatically and return the canonical report + tx hash.
- `GET /api/registry/0x…` — every attestation for an address, with per-record freshness.
- `GET /api/requests` — open paid audit requests from the onchain queue.
- `POST /api/requests` `{id}` — fulfill one request: audit the target, anchor the verdict, mark it done.

## Known limits (stated plainly)

- A proxy's own codehash never changes when its implementation is swapped — audit **implementation addresses**, not proxies.
- The canonical report JSON is returned to the caller, not stored by us; the chain holds its hash. Keep the JSON to prove what the hash commits to.
- Attestations are written by the Auditora attester key. The registry proves *what Auditora concluded and when* — decentralizing the attester set is future work.
