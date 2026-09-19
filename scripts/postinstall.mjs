import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

async function main() {
  try {
    console.log("Preparing Chromium pack for Vercel...");

    const chromiumResolvedUrl = import.meta.resolve("@sparticuz/chromium");
    const chromiumResolvedPath = fileURLToPath(chromiumResolvedUrl);

    // @sparticuz/chromium resolves inside build/, so walk back to package root.
    const chromiumPackageRoot = dirname(dirname(dirname(chromiumResolvedPath)));
    const binDir = join(chromiumPackageRoot, "bin");

    if (!existsSync(binDir)) {
      throw new Error(`Chromium bin directory not found at ${binDir}`);
    }

    const publicDir = join(projectRoot, "public");
    const outputPath = join(publicDir, "chromium-pack.tar");

    mkdirSync(publicDir, { recursive: true });

    execFileSync(
      "tar",
      ["-cf", outputPath, "-C", binDir, "."],
      {
        stdio: "inherit",
        cwd: projectRoot,
      },
    );

    console.log(`Chromium pack created: ${outputPath}`);
  } catch (error) {
    console.error(
      "Could not create Chromium pack:",
      error instanceof Error ? error.message : String(error),
    );

    // This IS critical for the Vercel-only K-Ruoka checker. Fail the build
    // instead of deploying an app that can never launch Chromium.
    process.exit(1);
  }
}

await main();
