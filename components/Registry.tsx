"use client";

import { useState } from "react";
import type { RegistryAttestation } from "@/lib/types";

interface Lookup {
  configured: boolean;
  registry?: string;
  registryUrl?: string;
  count: number;
  attestations: RegistryAttestation[];
  error?: string;
}

const POSTURE_LABEL: Record<string, string> = {
  clean: "Clean — no issues surfaced",
  "no-consensus": "No consensus — unverified flags only",
  corroborated: "Corroborated findings",
};

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Registry() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const a = address.trim();
    setError(null);
    setLookup(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setError("Paste a full 0x… contract address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/registry/${a}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed.");
      setLookup(data as Lookup);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="registry" className="sec">
      <div className="wrap">
        <div className="eyebrow">The registry</div>
        <h2>Has it been audited? Ask the chain.</h2>
        <p className="how-lede">
          Every Argus verdict is attested onchain, bound to the contract&apos;s
          codehash at audit time. Look up any Monad address — no account, no
          trust in us required.
        </p>

        <div className="console" style={{ marginTop: 24 }}>
          <div className="console-foot" style={{ borderTop: "none" }}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="0x… any contract address on Monad"
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                minWidth: 0,
              }}
            />
            <button className="btn btn-primary" onClick={check} disabled={loading}>
              {loading ? "Checking…" : "Check the registry"}
            </button>
          </div>
        </div>

        {error && <div className="banner err">{error}</div>}

        {lookup && !lookup.configured && (
          <div className="banner warn">
            Registry not configured on this deployment — set{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>
              ARGUS_REGISTRY_ADDRESS
            </code>
            .
          </div>
        )}

        {lookup && lookup.configured && lookup.count === 0 && (
          <div className="banner info">
            <b>Never audited.</b> No attestations for this address yet — run a
            contract audit above and the verdict will be anchored here.
          </div>
        )}

        {lookup && lookup.count > 0 && (
          <div className="findings" style={{ marginTop: 16 }}>
            {lookup.attestations.map((a, i) => (
              <div
                key={`${a.reportHash}-${i}`}
                className={`finding ${
                  a.posture === "corroborated" ? "edge-high" : "edge-info"
                }`}
              >
                <div className="finding-head" style={{ cursor: "default" }}>
                  <div className="finding-main">
                    <div className="finding-titlerow">
                      <span className="finding-id num">
                        #{lookup.count - i}
                      </span>
                      <p className="finding-title">
                        {POSTURE_LABEL[a.posture] ?? a.posture}
                        {a.posture === "corroborated" &&
                          ` — ${a.corroborated} corroborated`}
                        {a.lone > 0 && ` · ${a.lone} unverified`}
                      </p>
                    </div>
                    <span className="finding-loc">
                      report {a.reportHash.slice(0, 18)}… ·{" "}
                      {timeAgo(a.timestamp)}
                    </span>
                  </div>
                  <div className="finding-badges">
                    <span className={`con ${a.fresh ? "con-confirmed" : "con-lone"}`}>
                      <span className="cdot" />
                      {a.fresh ? "code unchanged" : "STALE — code changed"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {lookup.registryUrl && (
              <div className="foot-meta" style={{ marginTop: 8 }}>
                registry contract:{" "}
                <a href={lookup.registryUrl} target="_blank" rel="noreferrer">
                  {lookup.registry}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
