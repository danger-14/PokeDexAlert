# Final deployment order

1. Replace the PokeDexAlert files from this package.
2. Run `supabase/identity-update.sql` once.
3. Deploy PokeDexAlert and verify Prisma first.
4. Prisma tests:
   - Perfect Order ETB -> EAN 0196214136373
   - Chaos Rising ETB -> EAN 0196214139954
   - Pitch Black ETB -> EAN 0196214142138
   - 30th ETB -> EAN 0196214144828
5. For K-Citymarket, deploy the included `worker/` folder to Fly.io.
6. Add Vercel environment variables:
   - KRUOKA_WORKER_URL
   - KRUOKA_WORKER_SECRET
7. Redeploy PokeDexAlert and test K-Citymarket Jumbo.

The Prisma path does NOT depend on the K-Ruoka worker.
