import {
  isIP,
} from "node:net";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createMonitoredStore,
  deleteMonitoredStore,
  deleteMonitoredStoreGroup,
  loadMonitoredStores,
  renameMonitoredStore,
  updateMonitoredProduct,
} from "../../../lib/database";

import {
  normalizeProductText,
} from "../../../lib/productTerms";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =====================================================
   AUTH
   ===================================================== */

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

/* =====================================================
   URL VALIDATION
   ===================================================== */

function validatePublicUrl(
  value: string,
) {
  let url: URL;

  try {
    url =
      new URL(value);
  } catch {
    throw new Error(
      "Enter a valid product or store URL.",
    );
  }

  if (
    url.protocol !==
    "https:"
  ) {
    throw new Error(
      "Only HTTPS URLs are allowed.",
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new Error(
      "URLs cannot contain login information.",
    );
  }

  const hostname =
    url.hostname.toLowerCase();

  if (
    hostname ===
      "localhost" ||
    hostname.endsWith(
      ".localhost",
    ) ||
    hostname.endsWith(
      ".local",
    ) ||
    isIP(hostname)
  ) {
    throw new Error(
      "That URL is not allowed.",
    );
  }

  url.hash = "";

  return url.toString();
}

/* =====================================================
   GET ALL MONITORS
   ===================================================== */

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

/* =====================================================
   ADD PRODUCT
   ===================================================== */

export async function POST(
  request: NextRequest,
) {
  if (
    !isAuthorized(request)
  ) {
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
      typeof body.name ===
      "string"
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

    /*
     * Same URL is allowed.
     *
     * Only block an actual duplicate:
     * same store + same product + same URL.
     */

    const current =
      await loadMonitoredStores();

    const normalizedProduct =
      normalizeProductText(
        productName,
      );

    const duplicate =
      current.some(
        (monitor) =>
          monitor.name
            .trim()
            .toLowerCase() ===
            name
              .trim()
              .toLowerCase() &&
          normalizeProductText(
            monitor.product_name ||
              "",
          ) ===
            normalizedProduct &&
          monitor.listing_url ===
            productUrl,
      );

    if (duplicate) {
      throw new Error(
        "This exact product is already being monitored for this store.",
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

/* =====================================================
   EDIT PRODUCT OR STORE
   ===================================================== */

export async function PATCH(
  request: NextRequest,
) {
  if (
    !isAuthorized(request)
  ) {
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

    /*
     * EDIT INDIVIDUAL PRODUCT
     */

    if (
      body.kind ===
      "product"
    ) {
      const id =
        typeof body.id ===
        "string"
          ? body.id
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

      if (!id) {
        throw new Error(
          "Missing product monitor ID.",
        );
      }

      if (
        productName.length < 2 ||
        productName.length >
          160
      ) {
        throw new Error(
          "Product name must contain 2 to 160 characters.",
        );
      }

      await updateMonitoredProduct(
        id,
        productName,
        productUrl,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    /*
     * RENAME STORE
     */

    if (
      body.kind ===
      "store"
    ) {
      const oldName =
        typeof body.oldName ===
        "string"
          ? body.oldName.trim()
          : "";

      const newName =
        typeof body.newName ===
        "string"
          ? body.newName.trim()
          : "";

      if (
        oldName.length < 2
      ) {
        throw new Error(
          "Invalid current store name.",
        );
      }

      if (
        newName.length < 2 ||
        newName.length > 80
      ) {
        throw new Error(
          "Store name must contain 2 to 80 characters.",
        );
      }

      await renameMonitoredStore(
        oldName,
        newName,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    throw new Error(
      "Unknown update request.",
    );
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

/* =====================================================
   DELETE PRODUCT OR WHOLE STORE
   ===================================================== */

export async function DELETE(
  request: NextRequest,
) {
  if (
    !isAuthorized(request)
  ) {
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
      body.kind ===
      "store"
    ) {
      const name =
        typeof body.name ===
        "string"
          ? body.name.trim()
          : "";

      if (!name) {
        throw new Error(
          "Missing store name.",
        );
      }

      await deleteMonitoredStoreGroup(
        name,
      );

      return NextResponse.json({
        ok: true,
      });
    }

    const id =
      typeof body.id ===
      "string"
        ? body.id
        : "";

    if (!id) {
      throw new Error(
        "Missing product monitor ID.",
      );
    }

    await deleteMonitoredStore(
      id,
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
