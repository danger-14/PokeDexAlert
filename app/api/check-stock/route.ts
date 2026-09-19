import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadState,
  saveState,
} from "../../../lib/database";

import {
  sendStockAlert,
  type MailDeliveryResult,
} from "../../../lib/email";

import {
  filterDescription,
  scanStores,
} from "../../../lib/stores";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function runStockCheck(
  request: NextRequest,
) {
  const cronSecret = process.env.CRON_SECRET;

  const authorizationHeader = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "") || null;

  const querySecret = request.nextUrl.searchParams.get("secret");
  const suppliedSecret = authorizationHeader || querySecret;

  if (!cronSecret || suppliedSecret !== cronSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const [scanResult, savedProducts] = await Promise.all([
      scanStores(),
      loadState(),
    ]);

    const { products, errors } = scanResult;

    const savedState = new Map(
      savedProducts.map((product) => [
        product.monitor_id,
        product,
      ]),
    );

    const alertCandidates = products.filter((product) => {
      if (!product.monitorId || !product.available) {
        return false;
      }

      const previous = savedState.get(product.monitorId);

      /*
       * Alert when:
       * 1. this monitor has never been seen before, OR
       * 2. it changed from unavailable -> available, OR
       * 3. it is already marked available but no successful email was ever
       *    recorded for it.
       *
       * Rule #3 repairs the old failure mode where a product could remain
       * "available" in state forever even though no alert had been delivered.
       */
      return (
        !previous ||
        previous.available !== true ||
        !previous.last_alerted_at
      );
    });

    let mail: MailDeliveryResult | null = null;

    if (alertCandidates.length > 0) {
      /*
       * If Gmail rejects or fails this send, sendStockAlert throws.
       * We intentionally DO NOT save the new available state in that case,
       * so the next cron run retries the email instead of suppressing it.
       */
      mail = await sendStockAlert(alertCandidates);
    }

    const alertedMonitorIds = new Set(
      alertCandidates
        .map((product) => product.monitorId)
        .filter((value): value is string => Boolean(value)),
    );

    await saveState(products, alertedMonitorIds, savedState);

    const response = {
      ok: true,
      filter: filterDescription,
      checked: products.length,
      available: products.filter((product) => product.available).length,
      alertsSent: alertCandidates.length,
      email: mail,
      products,
      errors,
      checkedAt: new Date().toISOString(),
    };

    console.log("PokeDexAlert cron completed", {
      checked: response.checked,
      available: response.available,
      alertsSent: response.alertsSent,
      emailAccepted: mail?.accepted || [],
      errors: errors.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("PokeDexAlert cron failed", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        checkedAt: new Date().toISOString(),
      },
      {
        status: 500,
      },
    );
  }
}

export const GET = runStockCheck;
export const POST = runStockCheck;
