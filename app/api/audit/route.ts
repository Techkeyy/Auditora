import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/engine";
import { isAddress } from "@/lib/resolve";
import { attestAudit, canAttest } from "@/lib/registry";
import type { Mode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODES: Mode[] = ["contract", "code", "question"];

export async function POST(req: NextRequest) {
  let body: { mode?: string; input?: string; attest?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = (body.mode ?? "contract") as Mode;
  const input = typeof body.input === "string" ? body.input.trim() : "";

  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: `Unknown mode "${mode}".` }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: "Nothing to audit — input is empty." }, { status: 400 });
  }
  if (input.length > 160000) {
    return NextResponse.json(
      { error: "Input too large (160k char limit) — trim the contract or split it." },
      { status: 413 }
    );
  }

  try {
    const result = await runAudit(mode, input);

    // If we audited REAL code resolved from a Monad address, anchor the verdict
    // to the onchain registry. Never attest mock runs or unresolved inputs.
    const audited = result.meta.source.kind;
    const shouldAttest =
      body.attest !== false &&
      mode === "contract" &&
      isAddress(input) &&
      (audited === "address-source" || audited === "address-bytecode") &&
      !result.meta.usedMock &&
      canAttest();

    let canonical: string | undefined;
    if (shouldAttest) {
      try {
        const outcome = await attestAudit(result, input);
        result.meta.attestation = outcome.info;
        canonical = outcome.canonical;
      } catch (err) {
        // The audit is still valid — surface the anchoring failure honestly.
        result.meta.attestError =
          err instanceof Error ? err.message : "attestation failed";
      }
    }

    return NextResponse.json(canonical ? { ...result, canonical } : result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audit failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
