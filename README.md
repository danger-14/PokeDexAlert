# PokeDexAlert — Prisma availability + Open link + email alert fix

Replace these complete files in GitHub:

- `lib/stores.ts`
- `app/StoreManager.tsx`
- `app/api/check-stock/route.ts`

No database migration is required for this patch if the earlier identity update has already been applied.

## What was wrong

### 1. Prisma said "Availability unclear"
The previous Prisma parser looked for a narrow combined text pattern. Prisma's live product page currently exposes orderability as a delivery section containing phrases such as:

- `Valitse toimitustapa`
- `Nouto myymälästä`
- `Siirry valitsemaan myymälä`
- `Toimitus`
- `Kotiin tai noutopisteeseen`

The new parser scopes the check to Prisma's purchase/delivery section, accepts these real signals, and also uses Prisma's catalogue card state as a fallback. Prisma marks unavailable catalogue items explicitly with `Ei saatavilla`.

### 2. Open button went to the category/source page
The monitor stores a source URL, which may be a category page. The scanner already resolves the exact product URL. The updated StoreManager uses the resolved status URL when available:

`status?.url || monitor.listing_url`

So after a product has been checked, Open goes to the exact detected product page.

### 3. No email alert
The cron only emails products where `available === true`. Because the old Prisma parser returned `unknown`/`false`, the ETBs were intentionally excluded from email alerts.

After this patch, a Prisma ETB that has an active delivery/pickup flow becomes `in_stock` and `available: true`, so it becomes eligible for the next cron alert.

## Important cron authentication

`/api/check-stock` requires `CRON_SECRET`.

If your external cron service supports custom headers, use:

- URL: `https://YOUR-PRODUCTION-DOMAIN/api/check-stock`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`

If your cron service only lets you configure a URL, the route also supports:

`https://YOUR-PRODUCTION-DOMAIN/api/check-stock?secret=YOUR_CRON_SECRET`

Do not share your real CRON_SECRET in chat.

A request without the correct secret returns HTTP 401 and cannot send an email.

## Expected behavior after deployment

For a product such as Chaos Rising ETB / ME04:

- exact product is resolved by EAN/product identity;
- status should show `In stock` / `Available from Prisma` when Prisma exposes delivery or pickup;
- Open should go to the exact Prisma product page;
- the next authorized cron run should include it in the alert email if it has not already been successfully alerted.

The manual Refresh button checks status only. It does not itself send email.
