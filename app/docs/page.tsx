import Nav from "@/components/Nav";

export const metadata = {
  title: "Auditora — Docs",
};

export default function Docs() {
  return (
    <>
      <Nav variant="docs" />
      <div className="doc">
        <div className="eyebrow">Documentation</div>
        <h1>How Auditora works</h1>
        <p className="lead">
          Auditora runs a contract past a <strong>review board of agents</strong> —
          a Scout that reads the chain, an Auditor that proposes findings, an
          adversarial Challenger that attacks them, and a deterministic Judge — then
          anchors the surviving verdict to a public registry on Monad, bound to the
          contract&apos;s codehash. This page explains the mechanism, the honesty
          model, and the onchain layer.
        </p>

        <div className="toc">
          <div className="eyebrow">On this page</div>
          <a href="#idea">1 · The core idea</a>
          <a href="#pipeline">2 · The review board</a>
          <a href="#judgment">3 · Challenge &amp; judgment</a>
          <a href="#registry">4 · The onchain registry</a>
          <a href="#honesty">5 · What Auditora does and doesn&apos;t claim</a>
          <a href="#modes">6 · Modes</a>
          <a href="#run">7 · Running it yourself</a>
        </div>

        <h2 id="idea">1 · The core idea</h2>
        <p>
          Ask one model &ldquo;is this contract safe?&rdquo; and it answers in the
          same confident voice whether it&apos;s certain or guessing. The dangerous
          misses are the quiet ones — the vulnerability it never mentions, and the
          plausible-sounding one it invents.
        </p>
        <p>
          Auditora&apos;s answer is not a vote, it&apos;s an <strong>argument</strong>.
          One agent proposes findings; a second agent, running on a stronger reasoning
          model, is tasked with <em>breaking</em> them — proving false positives wrong
          and catching what the first missed. A finding is only trusted once it has
          survived that attack. Adversarial review catches more than agreement between
          look-alike models, which can share the same blind spot and be confidently
          wrong together.
        </p>
        <p>
          And because a verdict is only useful if others can find and trust it,
          Auditora doesn&apos;t stop at a web report: every audit of a deployed contract
          is <strong>attested on Monad</strong>, where anyone can look it up without
          trusting us.
        </p>

        <h2 id="pipeline">2 · The review board</h2>
        <pre>
          <code>{`0x… address on Monad
   │
   ▼   SCOUT      read the live chain — owner + type (EOA / multisig / renounced),
   │              native funds at risk, proxy → implementation, verified status.
   │              (Etherscan V2 + Monad RPC. Proxies are audited at the implementation.)
   │
   ▼   AUDITOR    real code + Scout's evidence → proposes candidate findings (JSON)
   │
   ▼   CHALLENGER stronger reasoning model, given the code AND the recon:
   │              attacks each finding → upheld / disputed / rejected, and catches misses
   │
   ▼   JUDGE      deterministic: status follows from the verdict; posture from status
   │
   ▼   NOTARY     keccak256(canonical report) ──► AuditoraRegistry.attest() on Monad`}</code>
        </pre>
        <p>
          The agents differ by <strong>job, not vendor</strong>, so the design is honest
          on any model set. On a single provider a fast model proposes (Auditor) and a
          reasoning model challenges — a genuine fast-proposes / deep-reasons asymmetry.
          Each agent returns strict JSON; if one call fails, the run continues and the
          UI says the board was degraded.
        </p>

        <h2 id="judgment">3 · Challenge &amp; judgment</h2>
        <p>
          The Challenger is the adversary. For every proposed finding it tries to build
          a refutation, then rules — and because a wrong rejection would declare a
          drainable contract safe, it only rejects when the refutation is airtight and
          defaults to &ldquo;disputed&rdquo; under any doubt:
        </p>
        <ul>
          <li>
            <strong style={{ color: "var(--con-confirmed)" }}>Upheld → Confirmed</strong>{" "}
            — it tried to break the finding and couldn&apos;t; the exploit path is real
            and reachable. Act on it.
          </li>
          <li>
            <strong style={{ color: "var(--con-contested)" }}>Disputed → Contested</strong>{" "}
            — plausible but unproven: unclear reachability or preconditions that may not
            hold. The row a human must read.
          </li>
          <li>
            <strong style={{ color: "var(--con-lone)" }}>Rejected → Dismissed</strong> —
            a proven false positive: the construct isn&apos;t there, or a specific guard
            makes it unreachable. Auditors raised it; the adversary knocked it down.
          </li>
        </ul>
        <p>
          The <strong>Judge is deterministic</strong>: a finding&apos;s status is a pure
          function of the Challenger&apos;s verdict, and the headline posture is computed
          from those statuses — never from model prose. That is the anti-inflation rail:
          a model cannot talk its way to &ldquo;critical&rdquo; on the strength of
          confident wording.
        </p>

        <h2 id="registry">4 · The onchain registry</h2>
        <p>
          When Auditora audits code resolved from a real Monad address, the Notary anchors
          the verdict to <code>AuditoraRegistry</code>, a small contract on Monad. Each
          attestation stores:
        </p>
        <ul>
          <li>
            <code>codehash</code> — the target&apos;s <code>EXTCODEHASH</code> at
            audit time. A verdict can never be carried over to different code: if
            the contract at that address ever changes, the attestation shows as{" "}
            <strong>stale</strong> automatically.
          </li>
          <li>
            <code>reportHash</code> — <code>keccak256</code> of the canonical report
            JSON. Auditora returns the canonical report to the caller; anyone holding
            it can re-hash and verify it against the chain.
          </li>
          <li>
            <code>posture</code> + counts — the verdict itself (clean / no-consensus /
            corroborated, plus confirmed and disputed counts), readable by other
            contracts and indexers.
          </li>
        </ul>
        <p>
          The registry also has a <strong>paid request queue</strong>:{" "}
          <code>requestAudit(target)</code> takes a small fee in MON and emits an
          event; the Auditora operator fulfills open requests and the attestation marks
          them done. That&apos;s the business model, onchain: audits as a public
          service with pay-per-use pricing.
        </p>
        <p>
          Known limit, stated plainly: a proxy&apos;s own codehash never changes when
          its implementation is swapped — audit implementation addresses, not
          proxies. (Scout resolves the implementation automatically for the audit.)
        </p>

        <h2 id="honesty">5 · What Auditora does and doesn&apos;t claim</h2>
        <p>
          Auditora is a <strong>first-pass triage layer</strong>, not a replacement for a
          professional audit and not a safety stamp. Surviving an adversarial challenge
          is a strong signal, not a proof — models can still share blind spots, so
          &ldquo;no confirmed findings&rdquo; means &ldquo;nothing survived attack,&rdquo;
          never &ldquo;proven safe.&rdquo; An attestation records exactly what the board
          concluded and when — it is not a certificate.
        </p>
        <p>
          What it <em>does</em> do well: it makes silent misses loud, it knocks down
          false positives instead of parroting them, and it makes verdicts{" "}
          <em>public and tamper-evident</em> — a contract that was audited before its
          code quietly changed stops looking audited.
        </p>

        <h2 id="modes">6 · Modes</h2>
        <ul>
          <li>
            <strong>Contract audit</strong> — the flagship. Paste Solidity, or just a
            Monad address: Auditora fetches the real deployed code and runs the full
            board. Address audits are attested onchain.
          </li>
          <li>
            <strong>Code review</strong> — the same board pointed at a general code
            snippet for bugs and security issues.
          </li>
          <li>
            <strong>Question</strong> — ask a technical question you&apos;re about to
            trust; risky or commonly-wrong claims are surfaced as findings.
          </li>
        </ul>

        <h2 id="run">7 · Running it yourself</h2>
        <pre>
          <code>{`npm install
cp .env.example .env.local     # add your gateway key (OpenRouter or DeepSeek)
npm run compile                # solc → lib/registry-artifact.json
AUDITORA_SIGNER_KEY=0x… npm run deploy   # deploy the registry to Monad testnet
npm run dev                    # http://localhost:3000`}</code>
        </pre>
        <p>
          With no key set, Auditora runs in <strong>mock mode</strong> — the full
          interface works against canned data so you can explore it offline. Add{" "}
          <code>GATEWAY_API_KEY</code> to go live, and{" "}
          <code>AUDITORA_REGISTRY_ADDRESS</code> + <code>AUDITORA_SIGNER_KEY</code> to
          anchor verdicts on Monad.
        </p>
        <hr />
        <p className="foot-meta">
          Auditora · built for the Spark Hackathon 2026 · every address audit ends
          onchain.
        </p>
      </div>
    </>
  );
}
