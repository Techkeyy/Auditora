import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/engine";
import {
  attestAudit,
  canAttest,
  fetchOpenRequests,
} from "@/lib/registry";
import { registryAddress } from "@/lib/chain";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/requests — open paid audit requests from the onchain queue. */
export async function GET() {
  if (!registryAddress()) {
    return NextResponse.json({ configured: false, requests: [] });
  }
  try {
    const requests = await fetchOpenRequests(20);
    return NextResponse.json({ configured: true, requests });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue read failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST /api/requests {id} — fulfill one paid request: audit the target, anchor the verdict. */
export async function POST(req: NextRequest) {
  if (!canAttest()) {
    return NextResponse.json(
      { error: "Attester not configured (AUDITORA_REGISTRY_ADDRESS / AUDITORA_SIGNER_KEY)." },
      { status: 503 }
    );
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.id || !/^\d+$/.test(body.id)) {
    return NextResponse.json({ error: "Pass a numeric request id." }, { status: 400 });
  }

  try {
    const open = await fetchOpenRequests(50);
    const request = open.find((r) => r.id === body.id);
    if (!request) {
      return NextResponse.json(
        { error: `Request #${body.id} is not open (already fulfilled, or out of range).` },
        { status: 404 }
      );
    }

    const result = await runAudit("contract", request.target);
    const kind = result.meta.source.kind;
    if (kind !== "address-source" && kind !== "address-bytecode") {
      return NextResponse.json(
        { error: `Could not resolve code for ${request.target}: ${result.meta.source.note}` },
        { status: 422 }
      );
    }

    const outcome = await attestAudit(result, request.target, BigInt(body.id));
    result.meta.attestation = outcome.info;
    return NextResponse.json({ ...result, canonical: outcome.canonical });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fulfillment failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
