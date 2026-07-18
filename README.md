# Auditora — the audit layer of Monad

**Paste any Monad contract address → a review board of AI agents (Scout, Auditor, Challenger, Judge) reviews the real deployed code → the verdict that survives adversarial challenge is attested onchain, bound to the contract's codehash.**

Built for the **Spark Hackathon 2026** (BuildAnything · Monad).

**Live:** https://auditora-2ocv.vercel.app · **Registry (Monad testnet):** [`0x81e8b82760b07a3224e0e528719b390fa28b0380`](https://testnet.monadexplorer.com/address/0x81e8b82760b07a3224e0e528719b390fa28b0380)

**Try it:** paste `0x51fb915e67ad45165c844b8a4fad9e53eb819f61` — a live testnet contract that holds funds, is owned by an EOA, and has real bugs. Watch recon read the chain, the board confirm the drainable ones and reject a false positive, and the verdict land onchain.

---

## The problem (mine, specifically)

I audit contracts constantly — before bug bounties, before integrating a protocol, before touching anything with money in it. Two things are broken about that workflow:

1. **A single AI auditor answers in the same confident voice whether it is certain or guessing.** The dangerous misses are the quiet ones — the vulnerability it never mentions, and the plausible-sounding one it invents.
2. **Even when I've done the work, the result dies in a chat log.** There is no public place where "this exact bytecode was reviewed, this was the verdict" lives — so everyone re-audits the same contracts from zero, and nobody can tell an audited contract from an unaudited one.

## The solution

Auditora fixes both halves with a **review board of agents that have different jobs** — not a vote of identical models:

- **Scout** reads the live chain around the address *before* any code is judged: who controls it (owner + whether it's an EOA, multisig, or renounced), what it holds (native funds at risk), and — for a proxy — where the real logic lives. Context decides whether a bug is theory or a live drain.
- **Auditor** reviews the real deployed code *with Scout's evidence* and proposes candidate findings — accusations, not yet verdicts.
- **Challenger** is the adversary. It runs on a stronger reasoning model and tries to *break* every finding: **upholds** what it can't refute, **disputes** the unproven, **rejects** false positives — and catches what the Auditor missed. A wrong rejection is treated as the worst outcome, so it only rejects with an airtight refutation.
- **Judge** is deterministic. A finding's status follows mechanically from the Challenger's verdict (upheld → confirmed, disputed → contested, rejected → dismissed). **Prose never sets the verdict** — this is the anti-inflation rail.
- **Notary** hashes the verdict and attests it to `AuditoraRegistry` on Monad, bound to the target's `EXTCODEHASH`. Anyone can look up any address — and if the code ever changes, the attestation **goes stale automatically**. No trust in us required.
- **Business model, onchain.** `requestAudit(target)` takes a small MON fee and queues any deployed contract for review; fulfillment marks the request done in the same attestation. Pay-per-audit, no accounts.

## How to read a result

| Status | Meaning | Trust |
| --- | --- | --- |
| **Confirmed** | survived the Challenger's attack | real risk — act on it |
| **Disputed** | the Challenger couldn't fully confirm or kill it | a lead to check |
| **Rejected** | the Challenger proved it a false positive | auditors raised it, adversary knocked it down |

An attestation records exactly what the board concluded and when. It is **not** a certificate of safety — models can still share blind spots. Auditora is a first-pass triage layer, loudest exactly where it should be: on the findings that survive attack.

## Architecture

```
0x… address on Monad
   │
   ▼  SCOUT — read the live chain: owner + type, funds at risk, proxy→implementation,
   │          verified status. (Etherscan V2 + Monad RPC.) Audit targets the impl for proxies.
   │
   ▼  AUDITOR — real code + Scout's evidence → proposes candidate findings (JSON)
   │
   ▼  CHALLENGER (stronger reasoning model) — attacks each finding: upheld / disputed /
   │             rejected, + catches misses. Given the code AND the recon to verify reachability.
   │
   ▼  JUDGE (deterministic) — status follows from the verdict; posture computed from status
   │
   ▼  NOTARY — keccak256(canonical report) ──► AuditoraRegistry.attest() on Monad
```

Agents differ by **job**, so the design is honest on any model set. On a single vendor, a fast model proposes (Auditor) and a reasoning model challenges (a real fast-proposes / deep-reasons asymmetry); with a multi-vendor gateway, each seat can be a different family.

- **Contract:** [`contracts/AuditoraRegistry.sol`](contracts/AuditoraRegistry.sol) — attestations bound to codehash, paid request queue, freshness check (`latest()` returns whether the current codehash still matches).
- **App:** Next.js (App Router) + TypeScript; chain access via viem; models via any OpenAI-compatible gateway (OpenRouter or a direct provider like DeepSeek).
- **Honesty rails:** status is set deterministically by the Judge from the Challenger's verdict, never by model prose; bytecode-only audits are labelled low-confidence; mock runs are never attested; addresses with no code short-circuit before the board runs.

## Getting started

```bash
npm install
cp .env.example .env.local        # add your gateway key (OpenRouter or DeepSeek)

npm run compile                   # solc → lib/registry-artifact.json
npm run deploy                     # deploy AuditoraRegistry to Monad testnet
# reads AUDITORA_SIGNER_KEY from .env.local; put the printed address back as
# AUDITORA_REGISTRY_ADDRESS

npm run dev                       # http://localhost:3000
```

With no key set (or `AUDITORA_FORCE_MOCK=1`), Auditora runs in **mock mode** against canned data so you can explore the interface offline. Live audits of pasted source need only the gateway key; auditing by address and onchain attestation need the Monad bits.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GATEWAY_API_KEY` | gateway key — OpenRouter or a direct provider like DeepSeek (required for live audits). `OPENROUTER_API_KEY` also works |
| `GATEWAY_BASE_URL` | OpenAI-compatible endpoint (OpenRouter default; e.g. `https://api.deepseek.com` for DeepSeek) |
| `AUDITORA_AUDITORS` | comma-separated Auditor slugs that propose findings (a fast model is fine) |
| `AUDITORA_CHALLENGER` | the adversary that judges findings — give it the **strongest reasoning model**; must differ from the Auditor. Falls back to `AUDITORA_REFEREE` |
| `AUDITORA_CHAIN_ID` | `10143` Monad testnet (default) · `143` mainnet |
| `AUDITORA_REGISTRY_ADDRESS` | deployed `AuditoraRegistry` address |
| `AUDITORA_SIGNER_KEY` | attester wallet key (needs a little MON for gas) |
| `ETHERSCAN_API_KEY` | optional — fetches *verified source* for addresses; without it Auditora audits raw deployed bytecode via RPC |
| `AUDITORA_FORCE_MOCK` | `1` forces mock mode (demo-safety switch) |

## API

- `POST /api/audit` `{mode, input}` — run the review board; address audits on Monad are attested automatically and return the canonical report + tx hash.
- `GET /api/registry/0x…` — every attestation for an address, with per-record freshness.
- `GET /api/requests` — open paid audit requests from the onchain queue.
- `POST /api/requests` `{id}` — fulfill one request: audit the target, anchor the verdict, mark it done.

## Known limits (stated plainly)

- A proxy's own codehash never changes when its implementation is swapped — audit **implementation addresses**, not proxies.
- The canonical report JSON is returned to the caller, not stored by us; the chain holds its hash. Keep the JSON to prove what the hash commits to.
- Attestations are written by the Auditora attester key. The registry proves *what Auditora concluded and when* — decentralizing the attester set is future work.
