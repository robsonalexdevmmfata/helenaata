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
- Workspace data is loaded into the in-memory reactive cache in `src/lib/store.ts` and persisted in Supabase through the authenticated server API; never use browser `localStorage` as a source of truth. Keep database credentials on the server and add schema changes as SQL migrations.
- Helena tool actions go through `runTool()` in `src/lib/helena/engine.ts` for permission checks, mutations, and execution logs; the client cache is synchronized to the authenticated Supabase workspace snapshot.
- Authenticated pages live under the pathless `src/routes/_app.tsx` layout (ssr: false, client-side session guard).
- tsconfig strict extras (exactOptionalPropertyTypes, noUncheckedIndexedAccess, noPropertyAccessFromIndexSignature) are disabled; preserve the existing project type-check settings.
- The browser calls the API same-origin (`/api/*`, rewritten by Vercel to Render); the Evolution global key lives only on the server and `/api/evolution/*` requires a signed-in session, so the key is never exposed or usable anonymously.
