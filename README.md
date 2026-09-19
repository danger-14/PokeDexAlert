# PokeDexAlert — Vercel-only K-Ruoka + reliable email alerts

This package is the clean replacement set for the current PokeDexAlert project.
It preserves the working Prisma EAN identity logic and removes the requirement for
`KRUOKA_WORKER_URL` / `KRUOKA_WORKER_SECRET`.

## What changes

### Prisma
- Keeps EAN-first product identity.
- 30th ETB -> EAN `0196214144828`.
- Perfect Order ETB -> ME03 / EAN `0196214136373`.
- Chaos Rising ETB -> ME04 / EAN `0196214139954`.
- Pitch Black ETB -> ME05 / EAN `0196214142138`.

### K-Citymarket / K-Ruoka
- Runs Chromium inside the Vercel Node function.
- Resolves the actual K-Ruoka store ID for the requested store (Jumbo).
- Searches store-scoped K-Ruoka product data.
- Uses exact EAN when an EAN is known.
- One Chromium session is shared across all K-Ruoka monitors during one cron run.
- A K-Ruoka browser/blocking failure is reported as a check error and is never treated
  as stock availability.

### Email alert reliability
The dashboard Refresh button only checks the product status. It does not send an email.
The `/api/check-stock` cron endpoint is the alerting path.

The updated cron/email state code now:
- sends on the first genuine available result;
- sends again when a product changes unavailable -> available;
- retries if no successful email was previously recorded;
- records `last_alerted_at` only after Gmail accepts the recipient;
- does not save an "alert sent" state if sending fails;
- preserves `last_alerted_at` during later state upserts;
- returns `email.accepted`, `email.rejected`, and `messageId` in the cron response;
- sends to `ALERT_EMAIL` when configured, otherwise to `GMAIL_USER`.

## Replace these files in GitHub

Copy the files from this package to the same paths in your PokeDexAlert repository:

- `package.json`
- `next.config.ts`
- `tsconfig.json`
- `scripts/postinstall.mjs`
- `lib/types.ts`
- `lib/productCatalog.ts`
- `lib/productTerms.ts`
- `lib/kRuokaBrowser.ts` (new)
- `lib/stores.ts`
- `lib/database.ts`
- `lib/email.ts`
- `app/api/check-stock/route.ts`
- `app/api/test-alert/route.ts`
- `app/api/stores/status/route.ts`

Do not replace your UI files (`StoreManager.tsx`, `page.tsx`, `styles.css`) for this update.
Do not replace `app/api/stores/route.ts` either.

The old `worker/` folder may remain in the repository. The root `tsconfig.json` excludes it,
and this new code does not import it. You can delete it later if desired, but deletion is not
required for this deployment.

`lib/kRuokaWorker.ts` may also remain. It is no longer imported.

## Supabase

If you already ran `supabase/identity-update.sql` for the Prisma identity update, do not run it
again just for this package. It creates `monitor_alert_state`, including `last_alerted_at`.

If you have NOT run it yet, run `supabase/identity-update.sql` once in Supabase SQL Editor.

`supabase/rearm-available-alerts-once.sql` is OPTIONAL. Use it only after a Test Alert succeeds
if an already-available test product still does not alert on the next cron run. It will re-arm
all products currently marked available so they each send one alert on the next cron run.

## Vercel environment variables

Required existing values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- `CRON_SECRET`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

Optional:

- `ALERT_EMAIL` — recipient address. If absent, alerts go to `GMAIL_USER`.

No longer required:

- `KRUOKA_WORKER_URL`
- `KRUOKA_WORKER_SECRET`

They can remain in Vercel because the new code ignores them.

## Deployment test order

1. Commit all replacement files and let Vercel redeploy.
2. Confirm the Vercel build log contains `Preparing Chromium pack for Vercel...` and that the
   build completes.
3. Open PokeDexAlert and use **Test alerts** first.
   A successful API response now says the address Gmail accepted for delivery.
4. Refresh your existing Prisma test ETB. Prisma should remain working.
5. Refresh K-Citymarket Jumbo. The result should now come from the Vercel Chromium path.
6. Let the cron call `/api/check-stock`. In Vercel logs, look for:
   `PokeDexAlert cron completed`.
   The response/log includes `checked`, `available`, `alertsSent`, and `emailAccepted`.

## Important alert behavior

A manual product Refresh does not send an email. It only verifies detection.
The email is sent by `/api/check-stock` when the cron runs.

If a test ETB is already available when this code is deployed, the new cron will alert it if
there is no `last_alerted_at` value. If the old code already wrote a timestamp despite you not
seeing the message, first confirm **Test alerts** works, then optionally run
`supabase/rearm-available-alerts-once.sql` once.

## K-Ruoka limitation

This is the strongest version that stays entirely within the existing GitHub + Vercel setup.
K-Ruoka uses Cloudflare bot protection. The code opens an actual Chromium session and performs
store-scoped requests from inside it, but K-Ruoka can still choose to reject Vercel/datacenter
browser traffic. If that happens, PokeDexAlert will show an explicit K-Ruoka blocking/check error
rather than generating a false stock alert.
