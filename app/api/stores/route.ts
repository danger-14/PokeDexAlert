import { isIP } from "node:net";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createMonitoredStore,
  deleteMonitoredStore,
  loadMonitoredStores,
} from "../../../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(
  request: NextRequest,
) {
  const expectedSecret =
    process.env.ADMIN_SECRET;

  const suppliedSecret =
    request.headers.get(
      "x-admin-secret",
    );

  return Boolean(
    expectedSecret &&
      suppliedSecret &&
      suppliedSecret ===
        expectedSecret,
  );
}

function validatePublicUrl(
  value: string,
) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Enter a valid website URL.",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error(
      "Only HTTPS website URLs are allowed.",
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new Error(
      "Website URLs cannot contain login information.",
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(
      ".localhost",
    ) ||
    hostname.endsWith(".local") ||
    isIP(hostname)
  ) {
    throw new Error(
      "That website address is not allowed.",
    );
  }

  url.hash = "";

  return url.toString();
}

export async function GET() {
  try {
    const stores =
      await loadMonitoredStores();

    return NextResponse.json({
      ok: true,
      stores,
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

export async function POST(
  request: NextRequest,
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Incorrect admin password.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const body =
      await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const productName =
      typeof body.productName ===
      "string"
        ? body.productName.trim()
        : "";

    const productUrl =
      typeof body.productUrl ===
      "string"
        ? validatePublicUrl(
            body.productUrl.trim(),
          )
        : "";

    if (
      name.length < 2 ||
      name.length > 80
    ) {
      throw new Error(
        "Store name must contain 2 to 80 characters.",
      );
    }

    if (
      productName.length < 2 ||
      productName.length > 160
    ) {
      throw new Error(
        "Product name must contain 2 to 160 characters.",
      );
    }

    if (!productUrl) {
      throw new Error(
        "Product or store URL is required.",
      );
    }

    const store =
      await createMonitoredStore(
        name,
        productName,
        productUrl,
      );

    return NextResponse.json({
      ok: true,
      store,
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
        status: 400,
      },
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Incorrect admin password.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const body =
      await request.json();

    if (
      typeof body.id !== "string" ||
      body.id.length < 10
    ) {
      throw new Error(
        "Invalid monitor ID.",
      );
    }

    await deleteMonitoredStore(
      body.id,
    );

    return NextResponse.json({
      ok: true,
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
        status: 400,
      },
    );
  }
}
