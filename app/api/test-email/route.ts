import { NextRequest, NextResponse } from "next/server";
import { sendStockAlert } from "../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  const suppliedSecret =
    request.nextUrl.searchParams.get("secret");

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
    await sendStockAlert([
      {
        store: "PokeDexAlert Test",
        title: "Test alert — email delivery is working",
        url: "https://github.com/danger-14/PokeDexAlert",
        price: "Test only",
        available: true,
      },
    ]);

    return NextResponse.json({
      ok: true,
      message: "Test email sent to the configured alert address.",
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
