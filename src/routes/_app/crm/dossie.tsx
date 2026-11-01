import { createFileRoute, Outlet } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/crm/dossie")({
  head: () => pageHead("Dossiê comercial", "Diagnóstico, concorrentes, ROI e proposta no mesmo lead."),
  component: () => <Outlet />,
});
