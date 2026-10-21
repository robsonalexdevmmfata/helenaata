import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";

// "/" sends the user into the app; the app layout redirects to /login when signed out.
export const Route = createFileRoute("/")({
  head: () => pageHead("Início", "HELENA AI: CRM, atendimento, prospecção e agentes de IA."),
  beforeLoad: () => {
    throw redirect({ to: "/visao-geral" });
  },
});
