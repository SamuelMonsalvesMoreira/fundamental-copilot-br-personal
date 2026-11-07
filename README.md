# Fundamental Copilot BR

Análise fundamentalista de ações brasileiras a partir de dados oficiais e atuais:
demonstrações financeiras da **CVM** (DFP e ITR), indicadores macro do **Banco Central**
(Selic, IPCA, CDI) e cotações/proventos da **brapi.dev**, com um copiloto de IA (Claude)
que responde citando os números do banco local.

> Ferramenta de estudo. Nada aqui é recomendação de investimento.

> **Projeto em reconstrução.** Este README será completado na etapa final. Situação atual:
> esqueleto do app, banco local e tela de status das fontes (`/dados`).

## Requisitos

- Node.js 22 ou superior (recomendado: 24 LTS)
- Git

## Instalação rápida

```powershell
git clone https://github.com/SamuelMonsalvesMoreira/fundamental-copilot-br-personal.git
cd fundamental-copilot-br-personal
npm ci
copy .env.example .env.local   # depois edite e preencha as chaves
npm run db:migrate
npm run dev
```

Abra http://localhost:3000.

## Chaves (arquivo `.env.local`)

| Variável | Para quê | Onde obter |
|---|---|---|
| `ANTHROPIC_API_KEY` | Copiloto de IA | https://console.anthropic.com/ |
| `BRAPI_TOKEN` | Cotações e proventos (plano gratuito) | https://brapi.dev/dashboard |
| `DATABASE_PATH` | Caminho do SQLite (opcional) | padrão: `data/app.db` |

As chaves ficam só no servidor e nunca devem ir para o Git (`.env.local` está no `.gitignore`).

## Estrutura

```
src/
  ingest/      coleta de dados (CVM, Banco Central, brapi) → SQLite
  db/          esquema (Drizzle) e migrações SQL versionadas
  analytics/   cálculo de indicadores e valuation (funções puras e testadas)
  ai/          copiloto: cliente Claude, ferramentas e prompts
  server/      consultas usadas pelas telas
  app/         páginas e rotas (Next.js App Router)
  components/  interface (shadcn/ui, gráficos)
scripts/       comandos de linha (migração, coleta, agendador)
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run db:migrate` | cria/atualiza o banco local |
| `npm test` | testes |
| `npm run validate` | lint + tipos + testes + build (o mesmo que a CI) |
