// @ts-nocheck — Arquivo de backend Node.js (Baileys). Não é importado pelo Vite/frontend.
/**
 * Helena WhatsApp Orchestrator
 * 
 * Processa mensagens do WhatsApp e decide quem responde:
 * - Helena (IA orquestradora)
 * - SDR (Prospecção)
 * - Closer (Fechamento)
 * - Atendimento
 */

import type { proto } from "@whiskeysockets/baileys";

/**
 * Mensagem recebida pelo WhatsApp
 */
export interface IncomingMessage {
  senderId: string;
  text: string;
  msg: proto.IWebMessageInfo;
}

/**
 * Processa mensagem do WhatsApp e retorna resposta
 */
export async function processHelenaMessage(incoming: IncomingMessage): Promise<string> {
  const { senderId, text } = incoming;
  
  // Para simplificar: roda a Helena com FreeLLMAPI ou Groq
  // Em produção, substitua por chamadas reais ao backend
  
  const response = await callHelenaAI(senderId, text);
  return response;
}

/**
 * Chama Helena AI via FreeLLMAPI ou Groq
 */
async function callHelenaAI(senderId: string, text: string): Promise<string> {
  try {
    // Tenta usar FreeLLMAPI
    const freellmUrl = import.meta.env.VITE_FREELLMAPI_URL;
    const freellmKey = import.meta.env.VITE_FREELLMAPI_KEY;
    
    if (freellmUrl && freellmKey) {
      const reply = await callFreeLLMAPI(senderId, text, freellmUrl, freellmKey);
      return reply;
    }
    
    // Fallback para Groq
    const groqKey = import.meta.env.VITE_GROQ_API_KEY;
    if (groqKey) {
      const reply = await callGroq(senderId, text, groqKey);
      return reply;
    }
    
    // Resposta padrão se não tiver API configurada
    return "Obrigado pelo contato! Sou a Helena da Info Tech. Preciso de uma chave de API FreeLLMAPI ou Groq para responder. Configure nas variáveis de ambiente.";
  } catch (err) {
    console.error("[Helena AI] Erro:", err);
    return "Opa! Tive uma instabilidade momentânea. Tente novamente em instantes!";
  }
}

/**
 * Chama FreeLLMAPI
 */
async function callFreeLLMAPI(senderId: string, text: string, url: string, key: string): Promise<string> {
  const systemPrompt = `Você é a Helena, assistente virtual de vendas da Info Tech Ltda.
Seja simpática, objetiva e profissional.
Seu objetivo: qualificar leads e marcar reunião com consultor.
Responda sempre em português brasileiro.

Contexto do contato: ${senderId}`;

  try {
    const response = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`FreeLLMAPI error: ${response.status}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "Não entendi. Pode reformular?";
  } catch (err) {
    throw new Error(`FreeLLMAPI falhou: ${err}`);
  }
}

/**
 * Chama Groq (alternativa gratuita)
 */
async function callGroq(senderId: string, text: string, apiKey: string): Promise<string> {
  const systemPrompt = `Você é a Helena, assistente virtual de vendas da Info Tech Ltda.
Seja simpática, objetiva e profissional.
Seu objetivo: qualificar leads e marcar reunião com consultor.
Responda sempre em português brasileiro.

Contexto do contato: ${senderId}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Groq error: ${response.status}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "Não entendi. Pode reformular?";
  } catch (err) {
    throw new Error(`Groq falhou: ${err}`);
  }
}
