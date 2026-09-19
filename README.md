# PokeDexAlert identity update

## Replace these app files

- `lib/types.ts`
- `lib/productCatalog.ts` (new)
- `lib/productTerms.ts`
- `lib/kRuokaWorker.ts`
- `lib/stores.ts`
- `lib/database.ts`
- `lib/email.ts`
- `app/api/check-stock/route.ts`
- `app/api/test-alert/route.ts`

## Supabase

Run `supabase/identity-update.sql` once in the Supabase SQL editor.

## What this changes

### Prisma

Prisma now uses EAN/Tuotekoodi as the strongest identity.

Known ETBs included:

- 30th Anniversary / Celebration ETB: `0196214144828`
- ME03 Perfect Order ETB: `0196214136373`
- ME04 Chaos Rising ETB: `0196214139954`
- ME05 Pitch Black ETB: `0196214142138`

Known existing Prisma product IDs are pre-bound for ME03/ME04/ME05.
The 30th ETB has no Prisma product ID in the registry yet, so Prisma is searched by EAN first and then its Pokémon catalogue is scanned for ETB candidates whose detail-page Tuotekoodi matches the EAN.

### Future releases

If a future product is added to `productCatalog.ts`, all store adapters can use the identity immediately.
You can also monitor an unregistered future product without changing code by including its EAN in the product name, e.g.:

`Future Set ETB 0196214XXXXXX`

### K-Citymarket / K-Ruoka

K-Ruoka is routed only through `kRuokaWorker.ts`. It no longer uses direct Vercel HTML fetches that return HTTP 403.
Set these Vercel variables after deploying the browser worker:

- `KRUOKA_WORKER_URL`
- `KRUOKA_WORKER_SECRET`

### Alert state

Email state is now keyed by the monitor row ID rather than by the final product URL. This prevents two products that share one category/source URL from suppressing each other's alerts.
