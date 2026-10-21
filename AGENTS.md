<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Frontend only: all data lives in the mock store `src/lib/store.ts` (seeded by `src/lib/seed.ts`, persisted in localStorage); never add Lovable Cloud/Supabase — the owner builds their own PostgreSQL backend later.
- Every Helena/agent/user action goes through `runTool()` in `src/lib/helena/engine.ts`, which checks permission, mutates the store and logs an Execution — so swapping to a real API changes one layer only.
- Authenticated pages live under the pathless `src/routes/_app.tsx` layout (ssr: false, client-side session guard).
- tsconfig strict extras (exactOptionalPropertyTypes, noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature) are off to keep mock-heavy UI code simple.
