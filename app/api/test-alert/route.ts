import { NextRequest, NextResponse } from "next/server";
import { sendTestAlert } from "../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  const suppliedSecret = request.headers.get("x-admin-secret");

  if (!adminSecret || suppliedSecret !== adminSecret) {
    return NextResponse.json(
      { ok: false, error: "Incorrect admin password." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as {
      productUrl?: string;
      productName?: string;
      storeName?: string;
    };

    const productUrl = body.productUrl?.trim();
    const productName = body.productName?.trim();
    const storeName = body.storeName?.trim();

    if (!productUrl) {
      throw new Error("Enter a product URL.");
    }

    const parsedUrl = new URL(productUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("The product URL must start with http:// or https://.");
    }

    await sendTestAlert({
      store: storeName || parsedUrl.hostname,
      title: productName || "Test product",
      url: parsedUrl.toString(),
      available: true,
    });

    return NextResponse.json({
      ok: true,
      message: "Test alert sent. Check your inbox and spam folder.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
