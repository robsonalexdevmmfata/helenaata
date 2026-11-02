import { useEffect, useRef } from "react";
import { evolutionConnectQr, getEvolutionStatus } from "@/lib/evolution/evolutionapi";

/**
 * Enquanto houver QR na tela: confere a conexão a cada 3s e renova o QR a cada ~25s
 * (o QR do WhatsApp expira). Chama onConnected quando o chip pareia.
 */
export function useEvolutionPairing(
  qr: string,
  setQr: (qr: string) => void,
  onConnected: (number?: string) => void,
) {
  const connectedRef = useRef(onConnected);
  connectedRef.current = onConnected;

  useEffect(() => {
    if (!qr) return;
    let stopped = false;
    let ticks = 0;
    const timer = setInterval(async () => {
      ticks += 1;
      const status = await getEvolutionStatus().catch(() => null);
      if (stopped) return;
      if (status?.connected) {
        stopped = true;
        clearInterval(timer);
        setQr("");
        connectedRef.current(status.number);
        return;
      }
      if (ticks % 8 === 0) {
        const pair = await evolutionConnectQr(undefined, 1).catch(() => null);
        if (!stopped && pair?.qr) setQr(pair.qr);
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(qr)]);
}
