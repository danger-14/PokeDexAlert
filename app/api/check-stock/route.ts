import { NextRequest, NextResponse } from "next/server";
import { scanAllStores } from "@/lib/stores";
import { getState, saveState } from "@/lib/database";
import { sendStockAlert } from "@/lib/email";
import type { ProductHit } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scans = await scanAllStores();
  const alerts: ProductHit[] = [];
  const stateErrors: string[] = [];

  for (const hit of scans.flatMap((s) => s.products)) {
    try {
      const previous = await getState(hit.id);
      const changedToAvailable = hit.status === "available" && previous?.last_status !== "available";
      // First sighting as AVAILABLE is intentionally alert-worthy.
      if (changedToAvailable) alerts.push(hit);
    } catch (e) {
      stateErrors.push(`${hit.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let emailSent = false;
  let emailError: string | undefined;
  if (alerts.length) {
    try {
      await sendStockAlert(alerts);
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  }

  for (const hit of scans.flatMap((s) => s.products)) {
    try {
      await saveState(hit, emailSent && alerts.some((x) => x.id === hit.id));
    } catch (e) {
      stateErrors.push(`${hit.name}: save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    stores: scans,
    alertCount: alerts.length,
    alerts,
    emailSent,
    emailError,
    stateErrors,
  });
}
