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
          Auditora turns a single, over-confident AI answer into a reconciled verdict
          from a swarm of independent models — then anchors that verdict to a public
          registry on Monad, bound to the contract&apos;s codehash. This page explains
          the mechanism, the honesty model, and the onchain layer.
        </p>

        <div className="toc">
          <div className="eyebrow">On this page</div>
          <a href="#idea">1 · The core idea</a>
          <a href="#pipeline">2 · The pipeline</a>
          <a href="#consensus">3 · Consensus &amp; triage</a>
          <a href="#registry">4 · The onchain registry</a>
          <a href="#honesty">5 · What Auditora does and doesn&apos;t claim</a>
          <a href="#modes">6 · Modes</a>
          <a href="#run">7 · Running it yourself</a>
        </div>

        <h2 id="idea">1 · The core idea</h2>
        <p>
          Ask one model &ldquo;is this contract safe?&rdquo; and it answers in the
          same confident voice whether it&apos;s certain or guessing. The dangerous
          misses are the quiet ones — the vulnerability it simply doesn&apos;t
          mention.
        </p>
        <p>
          Auditora exploits a simple asymmetry:{" "}
          <strong>disagreement between independent models is a reliable warning
          signal.</strong>{" "}
          If three auditors are asked the same question and one flags a critical the
          others missed, that&apos;s not noise — that&apos;s exactly where a human
          should look. Agreement, meanwhile, is a <em>weak positive</em>: reassuring,
          but never a proof of safety.
        </p>
        <p>
          And because the verdict is only useful if others can find and trust it,
          Auditora doesn&apos;t stop at a web report: every audit of a deployed contract
          is <strong>attested on Monad</strong>, where anyone can look it up without
          trusting us.
        </p>

        <h2 id="pipeline">2 · The pipeline</h2>
        <pre>
          <code>{`0x… address on Monad
   │
   ▼   resolve REAL code: verified source (explorer) or deployed bytecode (RPC)
   │
   ├─►  auditor A   (OpenAI)    ┐
   ├─►  auditor B   (Google)    ├─ parallel
   └─►  auditor C   (DeepSeek)  ┘
   │
   ▼   each returns structured findings (JSON)
   │
referee (4th family)  merges duplicates, records who flagged what
   │
   ▼
verdict  ──►  keccak256(report)  ──►  AuditoraRegistry.attest() on Monad`}</code>
        </pre>
        <p>
          Every auditor is called in parallel, so three opinions cost roughly the
          latency of one. Each is asked to return findings as strict JSON:{" "}
          <code>title</code>, <code>severity</code>, <code>location</code>,{" "}
          <code>description</code>, <code>recommendation</code>. If one model fails or
          returns junk, the run continues with the rest.
        </p>

        <h2 id="consensus">3 · Consensus &amp; triage</h2>
        <p>
          The hard part is that three models describe the <em>same</em> bug in three
          different ways. &ldquo;Reentrancy in withdraw()&rdquo; and &ldquo;external
          call before state update lets an attacker recurse&rdquo; are one finding.
          So a referee model merges them by root cause and location, then records the
          exact set of auditors that reported each one.
        </p>
        <p>From that agreement count, every finding gets a consensus level:</p>
        <ul>
          <li>
            <strong style={{ color: "var(--con-confirmed)" }}>Confirmed</strong> —
            all auditors flagged it. High confidence it&apos;s real.
          </li>
          <li>
            <strong style={{ color: "var(--con-contested)" }}>Contested</strong> —
            a majority flagged it. Probably real; verify.
          </li>
          <li>
            <strong style={{ color: "var(--con-lone)" }}>Lone flag</strong> — only
            one model raised it. Could be a subtle catch the others missed, or a
            false positive. This is the row a human must read.
          </li>
        </ul>

        <h2 id="registry">4 · The onchain registry</h2>
        <p>
          When Auditora audits code resolved from a real Monad address, it anchors the
          verdict to <code>AuditoraRegistry</code>, a small contract on Monad. Each
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
            <code>posture</code> + finding counts — the consensus verdict itself
            (clean / no-consensus / corroborated), readable by other contracts and
            indexers.
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
          proxies.
        </p>

        <h2 id="honesty">5 · What Auditora does and doesn&apos;t claim</h2>
        <p>
          Auditora is a <strong>first-pass triage layer</strong>, not a replacement for a
          professional audit and not a safety stamp. Three models trained on
          overlapping data can share a blind spot and all miss the same bug — so
          &ldquo;no findings&rdquo; means &ldquo;nothing obvious surfaced,&rdquo; never
          &ldquo;proven safe.&rdquo; An attestation records exactly what the swarm
          concluded and when — it is not a certificate.
        </p>
        <p>
          What it <em>does</em> do well: it makes silent misses loud, and it makes
          verdicts <em>public and tamper-evident</em>. A vulnerability one model
          catches and another ignores stops being invisible — and a contract that was
          audited before its code quietly changed stops looking audited.
        </p>

        <h2 id="modes">6 · Modes</h2>
        <ul>
          <li>
            <strong>Contract audit</strong> — the flagship. Paste Solidity, or just a
            Monad address: Auditora fetches the real deployed code and audits that.
            Address audits are attested onchain.
          </li>
          <li>
            <strong>Code review</strong> — the same swarm pointed at a general code
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
cp .env.example .env.local     # add your OpenRouter key
npm run compile                # solc → lib/registry-artifact.json
AUDITORA_SIGNER_KEY=0x… npm run deploy   # deploy the registry to Monad testnet
npm run dev                    # http://localhost:3000`}</code>
        </pre>
        <p>
          With no key set, Auditora runs in <strong>mock mode</strong> — the full
          interface works against canned data so you can explore it offline. Add{" "}
          <code>OPENROUTER_API_KEY</code> to go live, and{" "}
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
