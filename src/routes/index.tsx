import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/marketing/LandingPage";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/")({
  head: () => pageHead(
    "Helena AI",
    "A máquina que encontra quem não tem site, monta a prévia e chega no WhatsApp do dono.",
  ),
  component: LandingPage,
});
