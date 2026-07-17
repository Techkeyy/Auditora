"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import Registry from "@/components/Registry";
import { SAMPLES, PLACEHOLDER } from "@/lib/samples";
import type { AuditResult, Mode, MergedFinding } from "@/lib/types";

const MODE_LABELS: Record<Mode, string> = {
  contract: "Contract audit",
  code: "Code review",
  question: "Question",
};

function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("contract");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function run() {
    setError(null);
    setResult(null);
    if (!input.trim()) {
      setError("Nothing to audit yet — paste a contract or load the sample.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed.");
      setResult(data as AuditResult);
      // auto-open the top finding
      if (data.findings?.[0]) setOpen({ [data.findings[0].id]: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Nav />

      {/* HERO */}
      <header className="hero">
        <div className="hero-art" aria-hidden="true" />
        <div className="wrap">
          <div className="eyebrow">The audit layer of Monad · chain-aware, consensus-verified, anchored</div>
          <h1>
            Paste any Monad address.<br />
            Auditora reads the chain.<br />
            <em>The verdict goes onchain.</em>
          </h1>
          <p className="lede">
            A single AI misses things and says nothing. Auditora first reads the{" "}
            <b>live chain</b> around an address — who controls it, what it holds,
            where a proxy really points — then puts the <b>real deployed code</b> to
            a <b>swarm of independent models</b>, reconciles their findings, and
            anchors the consensus verdict to a <b>public onchain registry</b> bound
            to the contract&apos;s codehash. Anyone can check any address, forever.
          </p>
        </div>
      </header>

      {/* CONSOLE */}
      <section id="console" className="wrap">
        <div className="console">
          <div className="console-head">
            <div className="modes">
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <button
                  key={m}
                  className={`mode ${mode === m ? "active" : ""}`}
                  onClick={() => {
                    setMode(m);
                    setResult(null);
                    setError(null);
                  }}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="samples">
              <button
                className="samplebtn"
                onClick={() => setInput(SAMPLES[mode].value)}
              >
                {SAMPLES[mode].label}
              </button>
              {input && (
                <button className="samplebtn" onClick={() => setInput("")}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="editor">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDER[mode]}
              spellCheck={false}
            />
          </div>

          <div className="console-foot">
            <div className="foot-meta">
              <b>on-chain recon</b> &nbsp;→&nbsp; <b>independent model swarm</b>{" "}
              &nbsp;→&nbsp; <b>adversarial challenger</b> &nbsp;→&nbsp; verdict{" "}
              <b>anchored on Monad</b>
            </div>
            <button className="btn btn-primary" onClick={run} disabled={loading}>
              {loading ? "Auditing…" : "Run the audit"}
            </button>
          </div>
        </div>

        {error && <div className="banner err">{error}</div>}
        {loading && (
          <div className="banner info">
            <span className="spinner" />
            Running on-chain recon, fanning out to the model swarm, reconciling
            the findings, and anchoring the verdict… this takes a few seconds.
          </div>
        )}

        {result && <Results result={result} open={open} setOpen={setOpen} usd={usd} />}
      </section>

      {/* REGISTRY LOOKUP */}
      <Registry />

      {/* HOW IT WORKS */}
      <section id="how" className="sec alt">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2>Disagreement is the signal.</h2>
          <p className="how-lede">
            Four moves take a bare address to a verdict you can actually weigh.
          </p>

          <div className="pipeline">
            <div className="rail" aria-hidden="true" />

            <div className="stage">
              <div className="stage-top">
                <span className="stage-node num">01</span>
              </div>
              <h3>Recon the chain</h3>
              <p>
                Before a model sees the code, Auditora reads the live chain: who
                controls it, what it holds, and — for a proxy — where the real
                logic lives. Context decides whether a bug is theory or a live
                drain.
              </p>
              <div className="fan">
                <span className="fanchip">owner</span>
                <span className="fanchip">balance</span>
                <span className="fanchip">proxy impl</span>
              </div>
            </div>

            <div className="stage">
              <div className="stage-top">
                <span className="stage-node num">02</span>
              </div>
              <h3>Fan out</h3>
              <p>
                The real code plus that on-chain context hits several independent
                models at once. Diverse models catch different bugs; each returns
                structured findings.
              </p>
              <div className="fan">
                <span className="fanchip">independent</span>
                <span className="fanchip">model</span>
                <span className="fanchip">swarm</span>
              </div>
            </div>

            <div className="stage">
              <div className="stage-top">
                <span className="stage-node num">03</span>
              </div>
              <h3>Challenge &amp; judge</h3>
              <p>
                An adversarial Challenger attacks every claim — upholding real bugs,
                disputing the unproven, and rejecting false positives. A deterministic
                Judge sets the verdict from what survived.
              </p>
              <div className="outcomes">
                <span className="oc oc-confirmed">
                  <span className="ocdot" />Upheld
                </span>
                <span className="oc oc-contested">
                  <span className="ocdot" />Disputed
                </span>
                <span className="oc oc-lone">
                  <span className="ocdot" />Rejected
                </span>
              </div>
            </div>

            <div className="stage">
              <div className="stage-top">
                <span className="stage-node num">04</span>
              </div>
              <h3>Anchor onchain</h3>
              <p>
                The verdict is hashed and attested to the Auditora registry on Monad,
                bound to the contract&apos;s codehash — if the code ever changes,
                the badge goes stale automatically.
              </p>
              <div className="fan">
                <span className="fanchip saved">attested · Monad</span>
              </div>
            </div>
          </div>

          <div className="note">
            <div className="eyebrow">The honest part</div>
            <p>
              Auditora is a first-pass triage layer, not a substitute for a professional
              audit. Agreement between models is a strong signal, not a proof of
              safety — models can share blind spots. An attestation records exactly
              what the swarm concluded and when — it is not a certificate of safety.
              Auditora is loudest exactly where it should be: when the auditors disagree.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="brand">
            <span className="brand-name">Auditora</span>
          </div>
          <div className="muted">
            The audit layer of Monad · Spark Hackathon 2026
          </div>
          <a className="navlink" href="/docs">
            Read the docs →
          </a>
        </div>
      </footer>
    </>
  );
}

/* ---------- Results ---------- */

function Results({
  result,
  open,
  setOpen,
  usd,
}: {
  result: AuditResult;
  open: Record<string, boolean>;
  setOpen: (o: Record<string, boolean>) => void;
  usd: (n: number) => string;
}) {
  const { findings, receipt, auditors, meta } = result;

  const [showDisputed, setShowDisputed] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const confirmed = findings.filter((f) => f.status === "confirmed");
  const disputed = findings.filter((f) => f.status === "contested");
  const dismissed = findings.filter((f) => f.status === "dismissed");
  const sevCount = (s: string) =>
    confirmed.filter((f) => f.severity === s).length;

  return (
    <div className="results">
      {meta.usedMock && (
        <div className="banner info" style={{ marginBottom: 16 }}>
          Running in <b>mock mode</b> — no gateway key set. Numbers and findings are
          illustrative. Add <code style={{ fontFamily: "var(--font-mono)" }}>
          GATEWAY_API_KEY</code> to go live.
        </div>
      )}

      {meta.recon && meta.recon.isContract && (
        <div className="recon">
          <div className="recon-head">
            <div className="eyebrow">On-chain recon</div>
            <span className="recon-sub">
              gathered live before the audit · {meta.recon.chainName}
            </span>
          </div>
          <div className="recon-grid">
            <div className="recon-item">
              <span className="recon-k">Verified</span>
              <span className="recon-v">
                {meta.recon.verified ? (meta.recon.contractName || "yes") : "no"}
              </span>
            </div>
            <div className="recon-item">
              <span className="recon-k">Proxy</span>
              <span className="recon-v">
                {meta.recon.isProxy ? "yes → impl" : "no"}
              </span>
            </div>
            <div className="recon-item">
              <span className="recon-k">Owner</span>
              <span className={`recon-v recon-${meta.recon.ownerType}`}>
                {meta.recon.ownerType.replace("-like", "")}
              </span>
            </div>
            <div className="recon-item">
              <span className="recon-k">Funds at risk</span>
              <span className="recon-v num">{meta.recon.balanceEth} MON</span>
            </div>
          </div>
          {meta.recon.notes.length > 0 && (
            <ul className="recon-notes">
              {meta.recon.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {meta.source?.kind === "address-source" && (
        <div className="banner ok" style={{ marginBottom: 16 }}>
          <b>On-chain source fetched.</b> {meta.source.note}
        </div>
      )}

      {meta.source?.kind === "address-bytecode" && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <b>Unverified contract — bytecode only.</b> {meta.source.note} Paste
          verified Solidity <b>source</b> for a high-confidence audit.
        </div>
      )}

      {meta.source?.kind === "address-unfetched" && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <b>Couldn&apos;t fetch on-chain code.</b> {meta.source.note}
        </div>
      )}

      {meta.bytecodeMode && meta.source?.kind === "inline" && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <b>Bytecode analysis.</b> Findings are low-confidence pattern matches, not
          verified against source — models can hallucinate vulnerabilities at
          invented offsets. Paste verified Solidity <b>source</b> for a real audit.
        </div>
      )}

      {auditors.some((a) => a.error) && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <b>Degraded board — {auditors.filter((a) => !a.error).length} of{" "}
          {auditors.length} auditors completed.</b> The Challenger adjudicated only
          the reports that ran. Unavailable:{" "}
          {auditors
            .filter((a) => a.error)
            .map((a) => `${a.model} (${a.error})`)
            .join(", ")}
          .
        </div>
      )}

      <div className="verdict">
        <div className="eyebrow">Board verdict</div>
        <div className={`posture posture-${result.posture.level}`}>
          <span className="posture-dot" />
          {result.posture.line}
        </div>
        <p className="verdict-summary">
          <span className="vs-label">Challenger&apos;s summary</span>
          {result.headline}
        </p>

        <div className="stats">
          <Stat k="Confirmed" v={confirmed.length} accent={confirmed.length > 0} />
          <Stat k="Critical" v={sevCount("critical")} />
          <Stat k="High" v={sevCount("high")} />
          <Stat k="Disputed" v={disputed.length} />
          <Stat k="Rejected" v={dismissed.length} muted />
        </div>

        <div className="receipt">
          <div className="r-item">
            <span className="r-k">Models called</span>
            <span className="r-v num">{receipt.calls}</span>
          </div>
          <div className="r-item">
            <span className="r-k">{receipt.estimated ? "Swarm cost (est.)" : "Swarm cost"}</span>
            <span className="r-v accent num">
              {receipt.estimated ? "≈ " : ""}
              {usd(receipt.totalUsd)}
            </span>
          </div>
          <div className="r-item">
            <span className="r-k">Tokens in</span>
            <span className="r-v num">{receipt.promptTokens.toLocaleString()}</span>
          </div>
          <div className="r-item">
            <span className="r-k">Tokens out</span>
            <span className="r-v num">{receipt.completionTokens.toLocaleString()}</span>
          </div>
          <span className="r-tag num">
            {receipt.estimated
              ? "estimated from token usage — a full multi-model audit costs cents"
              : "real spend, straight from the gateway — a full audit costs cents"}
          </span>
        </div>

        {meta.attestation && (
          <div className="banner ok" style={{ marginTop: 16 }}>
            <b>Verdict anchored on Monad.</b> Report hash{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>
              {meta.attestation.reportHash.slice(0, 10)}…
            </code>{" "}
            attested to the Auditora registry, bound to this contract&apos;s codehash.{" "}
            <a href={meta.attestation.explorerUrl} target="_blank" rel="noreferrer">
              View the transaction →
            </a>
          </div>
        )}

        {meta.attestError && (
          <div className="banner warn" style={{ marginTop: 16 }}>
            <b>Audit complete, but onchain anchoring failed.</b> {meta.attestError}
          </div>
        )}
      </div>

      <div className="findings-section">
        <div className="findings-head">
          <div className="eyebrow">Confirmed findings</div>
          <span className="findings-count num">{confirmed.length}</span>
          {confirmed.length > 0 && (
            <span className="findings-hint">survived the Challenger · tap to expand</span>
          )}
        </div>

        {confirmed.length === 0 ? (
          <div className="banner info">
            {disputed.length === 0 && dismissed.length === 0
              ? "No findings surfaced — nothing obvious, but that is not a proof of safety."
              : "Nothing survived adversarial challenge as a confirmed bug. On sound code that is the expected result — see the disputed and rejected items below."}
          </div>
        ) : (
          <div className="findings">
            {confirmed.map((f) => (
              <Finding
                key={f.id}
                f={f}
                isOpen={!!open[f.id]}
                toggle={() => setOpen({ ...open, [f.id]: !open[f.id] })}
              />
            ))}
          </div>
        )}

        {disputed.length > 0 && (
          <div className="lone-section">
            <button
              className="lone-toggle"
              onClick={() => setShowDisputed(!showDisputed)}
            >
              <span className="lone-chevron">{showDisputed ? "−" : "+"}</span>
              {disputed.length} disputed finding
              {disputed.length > 1 ? "s" : ""} — the Challenger couldn&apos;t fully
              confirm or kill; review these
            </button>
            {showDisputed && (
              <div className="findings" style={{ marginTop: 12 }}>
                {disputed.map((f) => (
                  <Finding
                    key={f.id}
                    f={f}
                    isOpen={!!open[f.id]}
                    toggle={() => setOpen({ ...open, [f.id]: !open[f.id] })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {dismissed.length > 0 && (
          <div className="lone-section">
            <button
              className="lone-toggle"
              onClick={() => setShowDismissed(!showDismissed)}
            >
              <span className="lone-chevron">{showDismissed ? "−" : "+"}</span>
              {dismissed.length} rejected by the Challenger as false positive
              {dismissed.length > 1 ? "s" : ""} — auditors raised, adversary knocked down
            </button>
            {showDismissed && (
              <div className="findings" style={{ marginTop: 12 }}>
                {dismissed.map((f) => (
                  <Finding
                    key={f.id}
                    f={f}
                    isOpen={!!open[f.id]}
                    toggle={() => setOpen({ ...open, [f.id]: !open[f.id] })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* the debate — the auditors' raw claims, before the Challenger ruled */}
      <div className="debate">
        <div className="eyebrow">The bench · what each auditor claimed</div>
        <div className="debate-grid">
          {auditors.map((a) => (
            <div key={a.model} className="auditor">
              <div className="auditor-head">
                <span className="auditor-model num">{a.model}</span>
                <span className="auditor-prov">{a.provider}</span>
              </div>
              {a.error ? (
                <div className="err">error: {a.error}</div>
              ) : a.findings.length === 0 ? (
                <div className="foot-meta">No issues reported.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {a.findings.map((raw, i) => (
                    <li key={i}>
                      <span style={{ color: "var(--text-1)" }}>{raw.title}</span>{" "}
                      <span className="foot-meta">({raw.severity})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  k,
  v,
  accent,
  muted,
}: {
  k: string;
  v: number;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`stat${accent ? " stat-accent" : ""}${muted ? " stat-muted" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function Finding({
  f,
  isOpen,
  toggle,
}: {
  f: MergedFinding;
  isOpen: boolean;
  toggle: () => void;
}) {
  // status → the badge tone (reuses the existing con-* palette).
  const statusMap = {
    confirmed: { cls: "con-confirmed", label: "Upheld" },
    contested: { cls: "con-contested", label: "Disputed" },
    dismissed: { cls: "con-lone", label: "Rejected" },
  } as const;
  const st = statusMap[f.status];
  const muted = f.status === "dismissed";

  return (
    <div
      className={`finding edge-${f.severity}${muted ? " unverified" : ""}${
        isOpen ? " open" : ""
      }`}
    >
      <div className="finding-head" onClick={toggle}>
        <div className="finding-main">
          <div className="finding-titlerow">
            <span className="finding-id num">{f.id}</span>
            <p className="finding-title">{f.title}</p>
            {f.origin === "challenger" && (
              <span className="origin-tag">Challenger-found</span>
            )}
          </div>
          <span className="finding-loc">{f.location}</span>
        </div>
        <div className="finding-badges">
          <span className={`sev sev-${f.severity}`}>{f.severity}</span>
          <span className={`con ${st.cls}`}>
            <span className="cdot" />
            {st.label}
          </span>
          <span className="chevron" aria-hidden="true">
            {isOpen ? "−" : "+"}
          </span>
        </div>
      </div>
      {isOpen && (
        <div className="finding-body">
          <p>{f.description}</p>
          {f.challenge.rationale && (
            <div className={`challenge challenge-${f.status}`}>
              <span className="challenge-k">
                Challenger&apos;s ruling · {st.label.toLowerCase()}
              </span>
              <p>{f.challenge.rationale}</p>
            </div>
          )}
          {f.status !== "dismissed" && f.recommendation && f.recommendation !== "—" && (
            <div className="fix">
              <span className="fixk">Recommended fix</span>
              <p>{f.recommendation}</p>
            </div>
          )}
          <div className="agreed">
            <span className="lbl">
              {f.origin === "challenger" ? "Raised by" : "Claimed by"}
            </span>
            {f.origin === "challenger" ? (
              <span className="chip on">the Challenger</span>
            ) : (
              f.auditorsClaimed.map((m) => (
                <span key={m} className="chip on">
                  {m}
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
