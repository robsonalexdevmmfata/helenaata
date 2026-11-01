// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Porta local do projeto (site + servidor juntos). O ambiente do Lovable usa a dele.
const PORT = 8081;
const isLovableSandbox = process.env.LOVABLE_SANDBOX === "1" || !!process.env.DEV_SERVER__PROJECT_PATH;

type ApiModule = {
  handleApi: (req: unknown, res: unknown) => Promise<boolean>;
  startBackground: () => Promise<void>;
};

/** Monta o servidor (server/api.mjs) dentro do Vite: /health e /api/* na mesma porta do site. */
function helenaBackend(): Plugin {
  let api: Promise<ApiModule> | null = null;
  const load = () => (api ??= import(pathToFileURL(path.resolve("server/api.mjs")).href) as Promise<ApiModule>);
  return {
    name: "helena-backend",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      load()
        .then((m) => m.startBackground())
        .catch((e) => console.warn("[Helena] Servidor não carregou:", e?.message || e));
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (url !== "/health" && !url.startsWith("/health?") && !url.startsWith("/api/")) return next();
        load()
          .then((m) => m.handleApi(req, res))
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [helenaBackend()],
  vite: isLovableSandbox
    ? {}
    : {
        server: { port: PORT, strictPort: true },
        preview: { port: PORT, strictPort: true },
        build: { sourcemap: false },
      },
});
