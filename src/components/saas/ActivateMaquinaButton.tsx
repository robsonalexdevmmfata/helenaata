import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { caktoCheckoutUrl } from "@/lib/saas";
import type { User } from "@/lib/types";

export function ActivateMaquinaButton({
  user,
  className,
  size = "default",
}: {
  user?: User | null;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const href = caktoCheckoutUrl("maquina", {
    name: user?.name,
    email: user?.email,
    phone: user?.phone,
  });
  return (
    <Button asChild size={size} className={className}>
      <a href={href}>
        <Sparkles className="size-4" />
        Ativar plano Máquina
      </a>
    </Button>
  );
}

export function ActivateImpulsoButton({
  user,
  className,
  size = "default",
}: {
  user?: User | null;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const href = caktoCheckoutUrl("impulso", {
    name: user?.name,
    email: user?.email,
    phone: user?.phone,
  });
  return (
    <Button asChild variant="outline" size={size} className={className}>
      <a href={href}>Assinar Impulso (plano 1)</a>
    </Button>
  );
}
