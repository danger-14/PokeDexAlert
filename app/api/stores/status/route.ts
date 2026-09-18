import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadMonitoredStores,
} from "../../../../lib/database";

import {
  scanTarget,
} from "../../../../lib/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  try {
    const id =
      request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing monitor ID.",
        },
        {
          status: 400,
        },
      );
    }

    const monitors =
      await loadMonitoredStores();

    const target =
      monitors.find(
        (monitor) =>
          monitor.id === id,
      );

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Monitor was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const product =
      await scanTarget(target);

    return NextResponse.json({
      ok: true,
      checkedAt:
        new Date().toISOString(),
      product,
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
