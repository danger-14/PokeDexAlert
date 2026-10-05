# PokeDexAlert — clean rebuild

This is the simple rebuild of the original working stock monitor.

## What it monitors

Only these stores:
- PokePulls
- TCG Kauppa
- SwagyKarp
- Prisma

Only Pokémon **30th Anniversary / 30th Celebration** products in these target groups:
- Elite Trainer Box / ETB
- Booster Box / Booster Display
- Booster Bundle
- Ultra-Premium Collection / UPC, including Day and Night

It intentionally ignores blisters, tins, poster/binder collections, decks and other products.

## Alert behavior

- Checks store discovery/category/search pages for matching 30th listings.
- Opens the actual product page and determines availability.
- Prisma additionally probes its availability endpoint and looks for `rawShelfQuantity` / availability fields for the configured store names.
- Sends one combined Gmail alert when a product changes from `unknown` or `out_of_stock` to `available`.
- A product that is first discovered already available also alerts.
- No repeat email while it remains available.
- If it sells out and later becomes available again, it alerts again.
- Checkout is always manual.

## 1. Supabase

Create/open the Supabase project, go to SQL Editor, and run:

`supabase/schema.sql`

## 2. Gmail App Password

Use the Gmail account that sends the alerts. Google 2-Step Verification must be enabled, then create an App Password.

## 3. Vercel environment variables

Copy the names in `.env.example` into Vercel > Project > Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `ALERT_EMAIL` (already intended for dangeraldcruz@gmail.com)
- `CRON_SECRET`
- `ADMIN_PASSWORD`
- `PRISMA_STORES` (for example `Jumbo,Lippulaiva,Herttoniemi,Kerava,REDI`)

Do not commit real passwords or keys to GitHub.

## 4. Deploy

Upload these files to the `PokeDexAlert` GitHub repository and import/redeploy it in Vercel.

## 5. Test the checker

Open:

`https://YOUR-VERCEL-DOMAIN/api/check-stock?secret=YOUR_CRON_SECRET`

You should receive JSON showing all four store scans.

## 6. Scheduler

The endpoint to call is:

`GET https://YOUR-VERCEL-DOMAIN/api/check-stock`

with header:

`Authorization: Bearer YOUR_CRON_SECRET`

For the original setup, use an external scheduler such as cron-job.org at your chosen interval. A 5-minute interval was the original simple configuration.

## Notes about UPC release

The product discovery is dynamic. Day/Night UPC listings do not need to be hardcoded in advance: if they appear on one of the monitored store pages with 30th + Ultra-Premium/UPC naming, they are picked up automatically.

The current TCG Kauppa product pages already expose Day and Night UPC listings. Prisma may publish its UPC product pages closer to release; the category scanner will discover those when they appear.
