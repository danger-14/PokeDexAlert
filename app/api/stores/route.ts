import { NextResponse } from "next/server";
import { recentState } from "@/lib/database";
import { storeSummary } from "@/lib/stores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ stores: storeSummary(), state: await recentState() });
  } catch (e) {
    return NextResponse.json({ stores: storeSummary(), state: [], error: e instanceof Error ? e.message : String(e) });
  }
}
