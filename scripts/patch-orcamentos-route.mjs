import fs from "fs";
const p = "src/routeTree.gen.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("orcamentos")) {
  console.log("already");
  process.exit(0);
}
s = s.replace(
  "import { Route as AppProspeccaoCadenciasRouteImport } from './routes/_app/prospeccao/cadencias'",
  "import { Route as AppProspeccaoCadenciasRouteImport } from './routes/_app/prospeccao/cadencias'\nimport { Route as AppProspeccaoOrcamentosRouteImport } from './routes/_app/prospeccao/orcamentos'",
);
s = s.replace(
  `const AppProspeccaoCadenciasRoute = AppProspeccaoCadenciasRouteImport.update({
  id: '/prospeccao/cadencias',
  path: '/prospeccao/cadencias',
  getParentRoute: () => AppRoute,
} as any)`,
  `const AppProspeccaoCadenciasRoute = AppProspeccaoCadenciasRouteImport.update({
  id: '/prospeccao/cadencias',
  path: '/prospeccao/cadencias',
  getParentRoute: () => AppRoute,
} as any)
const AppProspeccaoOrcamentosRoute = AppProspeccaoOrcamentosRouteImport.update({
  id: '/prospeccao/orcamentos',
  path: '/prospeccao/orcamentos',
  getParentRoute: () => AppRoute,
} as any)`,
);
const inserts = [
  ["  '/prospeccao/cadencias': typeof AppProspeccaoCadenciasRoute,", "  '/prospeccao/orcamentos': typeof AppProspeccaoOrcamentosRoute,"],
  ["  '/_app/prospeccao/cadencias': typeof AppProspeccaoCadenciasRoute,", "  '/_app/prospeccao/orcamentos': typeof AppProspeccaoOrcamentosRoute,"],
  ["    | '/prospeccao/cadencias'", "    | '/prospeccao/orcamentos'"],
  ["    | '/_app/prospeccao/cadencias'", "    | '/_app/prospeccao/orcamentos'"],
];
for (const [after, line] of inserts) {
  if (!s.includes(after)) throw new Error("missing " + after);
  if (!s.includes(line)) s = s.replace(after, after + "\n" + line);
}
s = s.replace(
  `    '/_app/prospeccao/cadencias': {
      id: '/_app/prospeccao/cadencias'
      path: '/prospeccao/cadencias'
      fullPath: '/prospeccao/cadencias'
      preLoaderRoute: typeof AppProspeccaoCadenciasRouteImport
      parentRoute: typeof AppRoute
    }`,
  `    '/_app/prospeccao/cadencias': {
      id: '/_app/prospeccao/cadencias'
      path: '/prospeccao/cadencias'
      fullPath: '/prospeccao/cadencias'
      preLoaderRoute: typeof AppProspeccaoCadenciasRouteImport
      parentRoute: typeof AppRoute
    }
    '/_app/prospeccao/orcamentos': {
      id: '/_app/prospeccao/orcamentos'
      path: '/prospeccao/orcamentos'
      fullPath: '/prospeccao/orcamentos'
      preLoaderRoute: typeof AppProspeccaoOrcamentosRouteImport
      parentRoute: typeof AppRoute
    }`,
);
s = s.replace(
  "AppProspeccaoCadenciasRoute: AppProspeccaoCadenciasRoute,",
  "AppProspeccaoCadenciasRoute: AppProspeccaoCadenciasRoute,\n  AppProspeccaoOrcamentosRoute: AppProspeccaoOrcamentosRoute,",
);
fs.writeFileSync(p, s);
console.log("patched");
