// @ts-nocheck — Arquivo de backend Node.js (Baileys + SQLite). Não é importado pelo Vite/frontend.
/**
 * WhatsApp Worker - Motor de conexão Baileys com SQLite
 * 
 * Responsabilidades:
 * - Conectar ao WhatsApp via Baileys
 * - Persistir sessão em SQLite (database/whatsapp.db)
 * - Processar mensagens recebidas
 * - Enviar mensagens via API
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Baileys
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  DisconnectReason,
} from "@whiskeysockets/baileys";

// SQLite (better-sqlite3 para performance)
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho do banco SQLite para persistência da sessão WhatsApp
const DB_PATH = path.join(__dirname, "..", "..", "..", "database", "whatsapp.db");

/**
 * Estado global da conexão WhatsApp
 */
export interface WhatsAppState {
  socket: WASocket | null;
  status: "disconnected" | "connecting" | "awaiting_qr" | "connected";
  qrCode: string | null;  // DataURL base64
  lastConnectedAt: Date | null;
  phone: string;
}

/**
 * Worker do WhatsApp com persistência SQLite
 */
export class WhatsAppWorker {
  private static instance: WhatsAppWorker;
  private socket: WASocket | null = null;
  private db: Database.Database;
  private qrCode: string | null = null;
  private status: WhatsAppState["status"] = "disconnected";
  private lastConnectedAt: Date | null = null;

  constructor() {
    // Inicializa SQLite para persistência da sessão
    this.db = new Database(DB_PATH);
    
    // Cria schema se não existir
    this.initSchema();
    
    // Carrega sessão existente
    this.loadSession();
  }

  static getInstance(): WhatsAppWorker {
    if (!WhatsAppWorker.instance) {
      WhatsAppWorker.instance = new WhatsAppWorker();
    }
    return WhatsAppWorker.instance;
  }

  /**
   * Inicializa o schema do SQLite
   */
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Carrega sessão existente do SQLite
   */
  private loadSession() {
    try {
      const row = this.db.prepare("SELECT value FROM whatsapp_sessions WHERE key = 'creds'").get() as any;
      if (row?.value) {
        console.log("[WhatsApp] Sessão carregada do SQLite.");
      }
    } catch (err) {
      console.log("[WhatsApp] Nenhuma sessão encontrada no SQLite. Nova conexão necessária.");
    }
  }

  /**
   * Salva sessão no SQLite
   */
  private saveSession(key: string, value: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO whatsapp_sessions (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .run(key, value);
  }

  /**
   * Conecta ao WhatsApp via Baileys
   */
  async connect() {
    console.log("[WhatsApp] Inicializando conexão Baileys...");
    this.status = "connecting";

    // Usa SQLite para persistência de creds
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    // Busca versão mais recente
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Versão WA: ${version.join(".")} | Mais recente: ${isLatest}`);

    // Cria socket
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: state.keys,
      },
      printQRInTerminal: false,
      browser: ["Helena AI", "Chrome", "1.0"],
      syncFullHistory: false,
    });

    this.socket = sock;

    // Evento: update de conexão
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = "awaiting_qr";
        this.qrCode = qr;  // Pode converter para DataURL se necessário
        console.log("[WhatsApp] QR Code gerado. Escaneie com celular.");
      }

      if (connection === "close") {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Conexão encerrada. Reconectar: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          this.status = "disconnected";
          setTimeout(() => this.connect(), 3000);
        }
      }

      if (connection === "open") {
        this.status = "connected";
        this.lastConnectedAt = new Date();
        console.log("[WhatsApp] ✅ Helena WhatsApp Conectado!");
        
        // Salva credenciais
        const saveCredsLocal = async () => {
          if (state.creds) {
            this.saveSession("creds", JSON.stringify(state.creds));
          }
        };
        sock.ev.on("creds.update", saveCredsLocal);
      }
    });

    // Evento: mensagens recebidas
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      
      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message) continue;
        
        const senderId = msg.key.remoteJid;
        if (!senderId) continue;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!text.trim()) continue;
        
        console.log(`[WhatsApp] 📩 Mensagem de ${senderId}: "${text}"`);
        
        // Processa com Helena Orchestrator
        await this.processMessage(senderId, text, msg);
      }
    });

    // Evento: salva creds
    sock.ev.on("creds.update", saveCreds);
  }

  /**
   * Processa mensagem com Helena Orchestrator
   */
  private async processMessage(senderId: string, text: string, msg: any) {
    try {
      // Importa dinamicamente para evitar circular dependencies
      const { processHelenaMessage } = await import("./orchestrator");
      const reply = await processHelenaMessage({ senderId, text, msg });
      
      if (reply) {
        await this.sendMessage(senderId, reply);
      }
    } catch (err) {
      console.error(`[WhatsApp] Erro ao processar mensagem de ${senderId}:`, err);
    }
  }

  /**
   * Envia mensagem via WhatsApp
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket || this.status !== "connected") {
      throw new Error("WhatsApp não está conectado.");
    }

    const normalizedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    await this.socket.sendMessage(normalizedJid, { text });
    console.log(`[WhatsApp] ✉️ Mensagem enviada para ${normalizedJid}`);
  }

  /**
   * Retorna status da conexão
   */
  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      lastConnectedAt: this.lastConnectedAt,
      phone: process.env.VITE_WHATSAPP_PHONE || "5511999999999",
    };
  }

  /**
   * Retorna QR Code para o frontend
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   *Fecha conexão
   */
  async disconnect() {
    if (this.socket) {
      await this.socket?.logout();
      this.socket = null;
      this.status = "disconnected";
    }
  }
}
