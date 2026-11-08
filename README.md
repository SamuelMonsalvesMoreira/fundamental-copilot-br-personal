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

## Dados da CVM

- **Tickers**: vêm do FCA (formulário cadastral), que liga cada CNPJ aos seus códigos de
  negociação. Não há lista de empresas mantida à mão.
- **Demonstrações**: DFP (anual) e ITR (trimestral), sempre a versão mais recente de cada
  documento e o consolidado quando existir. Valores em R$.
- **Contas padronizadas** (`fin_values`): receita, EBIT, lucro, depreciação, caixa, dívida,
  patrimônio, fluxo de caixa etc. Como os códigos das contas mudam entre indústria, banco e
  seguradora, as contas são localizadas pela descrição das contas fixas da CVM. Cada valor
  guarda a conta de origem (`origin`). Capex e dividendos pagos vêm de linhas de texto livre
  da DFC e são marcados como `regra:` na origem.
- **Linhas completas** (`statement_lines`): DFP de todos os anos e ITR dos 2 anos mais
  recentes (para a aba "Demonstrações").

## Cotações e macro

- **brapi.dev**: a lista diária de todas as ações (preço, variação, volume, valor de mercado,
  subsetor) funciona **sem token**. Histórico e proventos por empresa precisam do token
  gratuito (15 mil requisições/mês). O token vai no cabeçalho da requisição, nunca na URL.
- **Banco Central (SGS)**: Selic meta (432), CDI (12, anualizado com 252 dias úteis),
  IPCA mensal (433) e IPCA 12 meses (13522), desde 2010.
- **Quantidade de ações**: a CVM não informa a escala da composição do capital e muitas
  empresas declaram em milhares. O app compara com o valor de mercado da brapi e escolhe o
  fator (1 ou 1.000). Se nada conferir, os indicadores por ação ficam indisponíveis em vez
  de errados.

### Agendamento no Windows (sem deixar o worker aberto)

```powershell
schtasks /create /tn "FundamentalCopilot Mercado" /sc weekly /d MON,TUE,WED,THU,FRI /st 19:30 /tr "cmd /c cd /d C:\caminho\do\projeto && npm run ingest:market"
schtasks /create /tn "FundamentalCopilot CVM" /sc daily /st 07:00 /tr "cmd /c cd /d C:\caminho\do\projeto && npm run ingest:cvm -- --from 2025"
```

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
| `npm run ingest:cvm` | baixa cadastro, tickers e DFP/ITR da CVM (~11 anos; só rebaixa o que mudou) |
| `npm run ingest:cvm -- --from 2024 --force` | recoleta a partir de um ano, mesmo sem mudanças |
| `npm run ingest:market` | Selic/CDI/IPCA (Banco Central) + cotações do dia (brapi) + conferência da quantidade de ações |
| `npm run ingest:market -- --ticker WEGE3` | histórico de 10 anos e proventos de um ticker (exige `BRAPI_TOKEN`) |
| `npm run worker` | agendador: mercado nos dias úteis às 19h30, CVM todo dia às 7h; recupera atrasos ao iniciar |
| `npm run dev:all` | app + agendador juntos |
| `npm test` | testes |
| `npm run validate` | lint + tipos + testes + build (o mesmo que a CI) |
