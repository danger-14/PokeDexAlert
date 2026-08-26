import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  saveState,
} from "../../../../lib/database";
import { sendStockAlert } from "../../../../lib/email";
import {
  filterDescription,
  scanStores,
} from "../../../../lib/stores";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function runStockCheck(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  const authorizationHeader =
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "") || null;

  const querySecret =
    request.nextUrl.searchParams.get("secret");

  const suppliedSecret =
    authorizationHeader || querySecret;

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
    const [
      { products, errors },
      savedProducts,
    ] = await Promise.all([
      scanStores(),
      loadState(),
    ]);

    const savedState = new Map(
      savedProducts.map((product) => [
        product.product_url,
        product,
      ]),
    );

    const newlyAvailable = products.filter(
      (product) =>
        product.available &&
        savedState.get(product.url)?.available !== true,
    );

    if (newlyAvailable.length > 0) {
      await sendStockAlert(newlyAvailable);
    }

    const alertedUrls = new Set(
      newlyAvailable.map((product) => product.url),
    );

    await saveState(products, alertedUrls);

    return NextResponse.json({
      ok: true,
      filter: filterDescription,
      checked: products.length,
      available: products.filter(
        (product) => product.available,
      ).length,
      alertsSent: newlyAvailable.length,
      products,
      errors,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      },
    );
  }
}

export const GET = runStockCheck;
export const POST = runStockCheck;
