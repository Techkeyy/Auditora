import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "@/lib/resolve";
import { lookupAttestations } from "@/lib/registry";

export const runtime = "nodejs";

/** GET /api/registry/0x… — everything the Monad registry knows about an address. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Not a valid address." }, { status: 400 });
  }
  try {
    const lookup = await lookupAttestations(address.toLowerCase());
    return NextResponse.json(lookup);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registry lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
