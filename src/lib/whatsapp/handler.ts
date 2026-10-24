/**
 * WhatsApp Handler - Integração Baileys com Helena AI
 * 
 * Este módulo:
 * - Conecta ao WhatsApp via Baileys (sqlite store)
 * - Recebe mensagens e encaminha para o orquestrador Helena
 * - Persiste conexão em SQLite (não precisa de banco PostgreSQL)
 * - Roda em segundo plano no Vite dev
 */

import { WhatsAppWorker } from "./worker";

/**
 * Inicia o worker do WhatsApp em segundo plano
 * Usa SQLite para persistência da sessão (não precisa de PostgreSQL)
 */
export async function initWhatsApp() {
  try {
    const worker = new WhatsAppWorker();
    await worker.connect();
    
    console.log("[WhatsApp] ✅ Helena WhatsApp Worker conectado!");
    return worker;
  } catch (err) {
    console.error("[WhatsApp] Erro ao iniciar:", err);
    throw err;
  }
}

/**
 * Envia mensagem via WhatsApp
 * @param phone - Número sem +55 ou @s.whatsapp.net
 * @param message - Texto da mensagem
 */
export async function sendWhatsAppMessage(phone: string, message: string) {
  const worker = WhatsAppWorker.getInstance();
  return worker.sendMessage(phone, message);
}

/**
 * Retorna o status atual da conexão WhatsApp
 */
export async function getWhatsAppStatus() {
  const worker = WhatsAppWorker.getInstance();
  return worker.getStatus();
}
