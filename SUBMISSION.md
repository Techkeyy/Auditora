# Auditora — Spark Hackathon submission kit

Everything needed to submit + record. Copy the form answers verbatim; follow the
script for the video.

---

## Submission-form answers

**Name**
Auditora

**Description** (a few words)
The audit layer of Monad — a review board of AI agents that audits any contract and writes the verdict onchain.

**Problem**
I audit contracts constantly — before bounties, before integrating a protocol, before trusting anything with money in it. Two things are broken: a single AI auditor sounds equally confident whether it's right or hallucinating, so you can't tell a real bug from an invented one; and even when the review is done, it dies in a chat log — there's no public place to check whether an address was ever audited, or what the verdict was.

**Solution**
Auditora runs a contract past a review board of AI agents with different jobs. A Scout reads the live chain first (owner, funds at risk, the real code behind a proxy). An Auditor proposes findings. An adversarial Challenger, on a stronger reasoning model, attacks every finding — upholding real bugs, disputing the unproven, and rejecting false positives. A deterministic Judge sets the verdict from what survived. Then the verdict is hashed and attested onchain to a registry contract on Monad, bound to the contract's codehash — so anyone can look up any address, and if the code ever changes, the badge goes stale automatically. No trust in us required.

**Project URL**
https://auditora-2ocv.vercel.app/

**Github repo**
https://github.com/Techkeyy/Auditora

**Category**
Testnet (Monad testnet, chain id 10143)

**Contract address**
0x81e8b82760b07a3224e0e528719b390fa28b0380  (AuditoraRegistry, Monad testnet)

**Demo video**
<paste the uploaded video URL — must be publicly visible, max 3 min>

**Post URL** (for "Most viral solution")
<paste the social post URL — see the draft post below>

---

## Live demo target (already deployed + funded)

Paste this into Auditora on the live site to show the full pipeline:

`0x51fb915e67ad45165c844b8a4fad9e53eb819f61`
— a VulnerableBank holding 0.1 MON (real funds at risk), EOA owner, with
reentrancy + owner-drain + tx.origin bugs. Recon shows funds+EOA, the board
confirms real bugs and rejects a false positive, and the verdict attests onchain.

Registry to show for the "look it up" moment:
`0x81e8b82760b07a3224e0e528719b390fa28b0380`

---

## 3-minute demo video script

Note on pacing: a full board review takes ~1 minute (the reasoning Challenger is
thorough). Either (a) narrate over the wait — recon appears within a few seconds,
so there's plenty to talk about while the board runs — or (b) pre-run it once,
then cut the dead air in editing. Record locally (no serverless timeout).

**[0:00–0:20] The problem — say it plainly**
> "Before I touch any smart contract, I want to know if it's safe. But a single
> AI auditor sounds just as confident when it's hallucinating a bug as when it's
> found a real one — and even after you review something, the result just dies in
> a chat window. Nobody else can check it. Auditora fixes both."

Show: the hero — "The audit layer of Monad."

**[0:20–0:45] Paste an address — recon fires**
Paste `0x51fb…`, click Run. Within seconds the **On-chain recon** panel appears.
> "First, before any AI sees the code, Auditora reads the live chain. This
> contract holds real funds, and its owner is a single wallet — a compromised key
> drains everything. That context decides whether a bug is theory or a live drain."

Show: recon panel — Funds at risk 0.1 MON, Owner: EOA.

**[0:45–1:45] The board argues (narrate over the wait)**
> "Now the review board. An Auditor proposes findings — accusations, not verdicts.
> Then an adversarial Challenger, running on a stronger reasoning model, tries to
> break every one of them. This is the important part: it's not a vote of
> look-alike models that can be confidently wrong together — it's one agent
> attacking another's work. And a deterministic Judge, not the model's prose, sets
> the final verdict."

Show: the pipeline section (Recon → Auditor → Challenge & judge → Anchor) while it runs.

**[1:45–2:25] The verdict — the money moment**
The result renders.
> "Here's the verdict. A critical reentrancy and an owner-drain — both UPHELD,
> because the Challenger tried to refute them and couldn't. And notice this one:
> the Auditor claimed a bug, and the Challenger REJECTED it as a false positive.
> That's the whole point — the adversary knocks down the noise so what's left is
> real."

Show: expand a confirmed finding (read the Challenger's ruling), then the
"rejected by the Challenger as false positive" row.

**[2:25–2:50] Onchain — anyone can check**
> "And the verdict goes onchain — hashed and attested to a registry on Monad,
> bound to this contract's exact code. So anyone can look up any address and see
> whether it was audited and what the board concluded — no account, no trusting
> me. If the code ever changes, the badge goes stale automatically."

Show: the "Verdict anchored on Monad" banner → click the tx link (explorer).
Then scroll to the Registry section, paste the same address, "Check the registry."

**[2:50–3:00] Close**
> "Auditora — the audit layer of Monad. It reads the chain, argues over the code,
> and writes the verdict where everyone can see it."

---

## Social post draft (viral prize)

> Most AI audit tools give you one confident opinion — and it's confidently wrong
> as often as it's right.
>
> So I built Auditora: a review board of AI agents that audit a contract, then an
> adversarial Challenger tries to *break* every finding. Only what survives the
> attack counts — and the verdict gets written onchain, bound to the contract's
> code, for anyone to check.
>
> Paste any Monad address → it reads the chain, argues over the code, anchors the
> verdict. Built for @monad_xyz Spark.
>
> [live link] [30–45s screen recording of the reject-a-false-positive moment]

Keep the clip to the single strongest beat: the Challenger rejecting a false
positive. That's the tweetable idea — "an AI that argues with itself so you don't
get one confident wrong answer."
