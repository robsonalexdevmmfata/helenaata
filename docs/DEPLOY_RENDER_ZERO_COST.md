# 🚀 Deploy Zero Cost no Render.com

Este guia mostra como subir o HELENA AI no **Render.com** com **CUSTO ZERO** usando SQLite (não PostgreSQL).

---

## 🎯 Arquitetura Zero Cost

| Componente | Serviço | Custo |
|------------|---------|-------|
| **Backend** | Render.com Web Service | **GRÁTIS** |
| **Database** | SQLite (arquivo no disco) | **GRÁTIS** |
| **WhatsApp** | Baileys (mesmo projeto) | **GRÁTIS** |
| **IA** | FreeLLMAPI / Groq (free tiers) | **GRÁTIS** |
| **Domínio** | `.onrender.com` | **GRÁTIS** |

---

## 📋 Pré-requisitos

1. Conta no [Render.com](https://dashboard.render.com)
2. Repositório GitHub (onde o projeto Lovable está)
3. Conta gratuita em um dos providers de IA:
   - [FreeLLMAPI](https://freellmapi.co) (GRÁTIS)
   - [Groq](https://console.groq.com) (GRÁTIS - $5/mês de bônus)

---

## 🔧 Passo a Passo - Deploy

### 1. Prepare o repositório GitHub

No terminal, execute:

```bash
# Acesse o diretório do projeto
cd "c:\Users\tecro\OneDrive\Documentos\sample-admin-harbor"

# Instale dependências
npm install

# Verifique se compila
npm run build
```

Se der erro de `better-sqlite3`, instale:

```bash
npm install better-sqlite3 --save
npm install @types/better-sqlite3 --save-dev
```

### 2. Atualize o `.env` para Render

No seu repositório GitHub, crie o arquivo `.env` com:

```env
# Porta do Render (não mude este valor)
PORT=3000

# FreeLLMAPI (GRÁTIS) - obtenha em https://freellmapi.co
VITE_FREELLMAPI_URL=https://freellmapi.co/v1
VITE_FREELLMAPI_KEY=SK_SEU_KEY_AQUI

# Groq (alternativa GRÁTIS) - obtenha em https://console.groq.com
VITE_GROQ_API_KEY=sua_groq_key_aqui

# WhatsApp - número para prospecção
VITE_WHATSAPP_PHONE=5511999999999

# Chave secreta
VITE_HELENA_API_KEY=helena-ai-backend-secret-key-random
```

### 3. Crie o arquivo `render.yaml`

No diretório raiz do projeto, crie:

```yaml
services:
  - type: web
    name: helena-ai
    env: node
    plan: free
    region: oregon
    buildCommand: npm install && npm run build
    startCommand: npm run preview
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: VITE_FREELLMAPI_URL
        value: https://freellmapi.co/v1
      - key: VITE_FREELLMAPI_KEY
        sync: false  # Defina no painel do Render
      - key: VITE_GROQ_API_KEY
        sync: false  # Defina no painel do Render
      - key: VITE_WHATSAPP_PHONE
        value: "5511999999999"
```

### 4. Deploy no Render

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **New → Web Service**
3. Conecte seu GitHub
4. O Render detecta o `render.yaml`
5. Configure as variáveis de ambiente no painel:
   - `VITE_FREELLMAPI_KEY` → sua chave
   - `VITE_GROQ_API_KEY` → sua chave (opcional)
6. Clique em **Deploy**

### 5. Configure o WhatsApp

1. Após deploy, acesse `https://seu-servico.onrender.com/api/whatsapp/qrcode`
2. Escaneie o QR Code com celular
3. WhatsApp 24/7 estará operacional

---

## ⏰ Mantenha Acordado (Plano Gratuito)

O Render coloca services free para dormir após 15 minutos de inatividade.

### Opção 1: UptimeRobot (GRÁTIS)

1. Acesse [uptimerobot.com](https://uptimerobot.com)
2. Crie nova monitoração HTTP
3. URL: `https://seu-servico.onrender.com/health`
4. Intervalo: 5 minutos
5. Salve

### Opção 2: Cron-Job.org (GRÁTIS)

1. Acesse [cron-job.org](https://cron-job.org)
2. Create Cronjob
3. Execution Time: `*/5 * * * *` (a cada 5 minutos)
4. URL: `https://seu-servico.onrender.com/health`
5. Salve

### Opção 3: Uptime Kuma (auto-hospedado)

Se já tem um servidor em casa, use Uptime Kuma para pingar o Render.

---

## 🔒 Segurança no Render

### Variáveis de Ambiente (Secrets)

No painel do Render → **Environment**:
- ✅ Marque **"Protect this variable"** para chaves de API
- ❌ Nunca commit `VITE_FREELLMAPI_KEY` no GitHub
- Use `sync: false` no `render.yaml` para secrets

### GitHub .gitignore

Certifique-se que `.env` está no `.gitignore`:

```gitignore
# Variáveis de ambiente
.env
.env.local
.env.*.local

# Sessão WhatsApp
auth_info_baileys/

# SQLite
database/*.db
database/*.db-shm
database/*.db-wal

# Build
node_modules/
dist/
output/

# Logs
*.log
logs/
```

---

## 📊 Monitoramento

### Ver Logs no Render

No painel → **Manual Deploy** → **Latest Build** → **Logs**

Comandos úteis nos logs:
- `✅ Helena WhatsApp Conectado!` → WhatsApp operacional
- `[Helena AI]` → Mensagens processadas
- `[WhatsApp]` → Logs do Baileys

### Status da Conexão WhatsApp

Acesse: `https://seu-servico.onrender.com/api/whatsapp/status`

Resposta esperada:
```json
{
  "status": "connected",
  "message": "WhatsApp conectado e operando normalmente.",
  "lastConnectedAt": "2025-10-20T...",
  "isReady": true
}
```

---

## 🧪 Testes

### Teste 1: Helena Responde

1. Abra o WhatsApp no celular
2. Envie para o número configurado: "Olá Helena"
3. Espere resposta

### Teste 2: API Funciona

```bash
curl -X GET "https://seu-servico.onrender.com/health"
```

Resposta:
```json
{
  "status": "ok",
  "system": "Helena AI Backend",
  "version": "1.0.0",
  "uptime": 1234
}
```

### Teste 3: QR Code WhatsApp

```bash
curl -X GET "https://seu-servico.onrender.com/api/whatsapp/qrcode"
```

Resposta (se conectando):
```json
{
  "status": "awaiting_qr",
  "message": "Escaneie o QR Code abaixo...",
  "qrCode": {
    "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "raw": "0123..."
  }
}
```

---

## 🛠️ Troubleshooting

### Erro: `better-sqlite3` não compila

Solução:
```bash
npm install --save better-sqlite3
npm run build
```

Se continuar erro, use `better-sqlite3` já pré-compilado:

```bash
npm install --save better-sqlite3@latest
```

### WhatsApp não conecta

1. Verifique se o número está correto em `.env`
2. Escaneie QR Code com o **mesmo celular** do número
3. Aguarde 30 segundos após QR Code
4. Reinicie o service no Render (Manual Deploy → Deploy Latest Commit)

### FreeLLMAPI não responde

1. Verifique chave em [freellmapi.co](https://freellmapi.co)
2. Teste manualmente:
   ```bash
   curl -X POST "https://freellmapi.co/v1/chat/completions" \
     -H "Authorization: Bearer SUA_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Oi"}]}'
   ```

### Service dorme muito rápido

Use o UptimeRobot + Cron-Job.org juntos para pingar a cada 5 minutos.

---

## 📈 Escalabilidade Futura

Quando precisar escalar (pague apenas se precisar):

| Nível | Custo | Solução |
|-------|-------|---------|
| **Zero** | $0 | Render Free + SQLite (atual) |
| **Small** | $7/mês | Render Basic + SQLite |
| **Medium** | $15/mês | Render Pro + PostgreSQL (Overlay) |
| **Large** | $25+/mês | AWS/GCP + PostgreSQL + Redis |

---

## 🎯 Checklist de Deploy

- [ ] Repositório GitHub atualizado com `.env`
- [ ] `render.yaml` criado no root
- [ ] Variáveis de ambiente configuradas no Render
- [ ] FreeLLMAPI ou Groq configurado
- [ ] WhatsApp number configurado
- [ ] UptimeRobot ativado
- [ ] Teste WhatsApp funcional
- [ ] Teste API funcional

---

## 📞 Suporte

Se precisar de ajuda:

1. Verifique logs do Render
2. Teste localmente primeiro (`npm run dev`)
3. Consulte este guia novamente

---

**✨ Deploy Zero Cost concluído! Helena AI rodando no Render.com!**
