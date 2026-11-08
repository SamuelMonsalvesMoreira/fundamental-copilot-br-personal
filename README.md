# Fundamental Copilot BR

Análise fundamentalista de ações brasileiras a partir de dados oficiais e atuais:
demonstrações financeiras da **CVM** (DFP e ITR), Selic, CDI e IPCA do **Banco Central** e
cotações e proventos da **brapi.dev** e do **Yahoo Finance**, com um copiloto de IA (Claude) que responde citando os
números do banco local.

> Ferramenta de estudo para uso pessoal. Nada aqui é recomendação de investimento.

## O que o app faz

- **Busca** por ticker ou nome, com autocomplete.
- **Página da empresa:** indicadores com fórmula e fonte, gráficos de até 10 anos, demonstrações,
  valuation (Graham, Bazin e DCF editável), projeções, pares do setor, chat com IA e relatório.
- **Screener** com filtros, **comparador** de 2 a 4 empresas e **carteira/watchlist**.
- **Dados** (`/dados`): quando cada fonte foi coletada e se houve erro.

Cada tela mostra a data e a fonte dos números. Dado ausente aparece como "—", com o motivo, e
nunca como zero.

## Requisitos

- Node.js 22 ou superior (recomendado: 24 LTS)
- Git
- Cerca de 300 MB livres para o banco local

No Windows, use uma pasta de caminho curto, como `C:\dev\fundamental-copilot`: caminhos muito
longos quebram ferramentas do Node e do Git.

## Instalação

```powershell
git clone https://github.com/SamuelMonsalvesMoreira/fundamental-copilot-br-personal.git
cd fundamental-copilot-br-personal
npm ci
copy .env.example .env.local
```

Abra o `.env.local`, preencha as chaves (tabela abaixo) e faça a primeira carga de dados, que leva
cerca de 5 minutos:

```powershell
npm run setup
```

Depois é só rodar:

```powershell
npm run dev:all
```

Abra http://localhost:3000. O `dev:all` sobe o app e o agendador das coletas. Use `npm run dev`
se quiser só o app.

## Chaves (arquivo `.env.local`)

| Variável | Obrigatória? | Para quê | Onde obter |
|---|---|---|---|
| `BRAPI_TOKEN` | Não | Reserva caso o Yahoo Finance falhe (plano gratuito) | https://brapi.dev/dashboard |
| `ANTHROPIC_API_KEY` | Só para a IA | Abas Copiloto e Relatório (uso pago por consumo) | https://console.anthropic.com/ |
| `CLAUDE_CHAT_MODEL` | Não | Modelo do chat (padrão `claude-sonnet-5-5`) | |
| `CLAUDE_REPORT_MODEL` | Não | Modelo do relatório (padrão `claude-opus-5-5`) | |
| `DATABASE_PATH` | Não | Caminho do SQLite (padrão `data/app.db`) | |

Sem nenhuma chave, o app funciona por inteiro, exceto o chat com IA e o relatório com IA:
balanços, indicadores, histórico de preços, proventos, screener, comparador, carteira, projeções
e relatório automático em PDF.

As chaves ficam só no servidor e nunca devem ir para o Git (`.env.local` está no `.gitignore`).
O app não tem login: rode apenas no seu computador e não o exponha na internet, porque qualquer
pessoa com acesso poderia consumir a sua chave da API.

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
  subsetor) funciona **sem token**.
- **Yahoo Finance**: histórico de 10 anos e proventos por ticker, sem token. Se falhar e houver
  `BRAPI_TOKEN`, a brapi é usada como reserva.
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

## Como os indicadores são calculados

Código em `src/analytics` (funções puras). Cada indicador guarda a fórmula, as entradas,
o período e a fonte. Quando não dá para calcular, explica por quê (nunca mostra zero no lugar).

- **Períodos**: resultado e caixa nos **últimos 12 meses** (TTM = acumulado do ano +
  último exercício − mesmo acumulado do ano anterior; ex.: 9M26 + 2025 − 9M25).
  Balanço na data do último documento. Médias usam o mesmo mês do ano anterior.
- **Lucro** = atribuído aos controladores. **EBITDA** = EBIT + depreciação/amortização
  (sem ajustes; empresas costumam divulgar EBITDA "ajustado", que pode diferir).
- **Dívida líquida** = empréstimos e financiamentos (CP + LP) − caixa − aplicações de CP.
- **Valor de mercado** = ações em circulação × preço de cada classe (ON/PN).
  **EV** = valor de mercado + dívida líquida + minoritários.

| Indicador | Fórmula |
|---|---|
| P/L | valor de mercado ÷ lucro 12m |
| P/VP | valor de mercado ÷ PL dos controladores |
| EV/EBITDA | EV ÷ EBITDA 12m |
| ROE | lucro 12m ÷ PL médio |
| ROIC | EBIT × (1 − alíquota efetiva, 0–34%) ÷ (PL + dívida líquida) médio |
| Margens | lucro bruto, EBITDA, EBIT e lucro ÷ receita líquida |
| Dívida líquida/EBITDA | dívida líquida ÷ EBITDA 12m |
| Dividend yield | proventos por ação com data ex nos últimos 12 meses ÷ preço (sem token da brapi: dividendos pagos na DFC ÷ valor de mercado) |
| Payout | dividendos pagos (DFC, 12m) ÷ lucro 12m |
| CAGR 5 anos | (último exercício ÷ exercício de 5 anos antes)^(1/5) − 1 |

Para **bancos e seguradoras**, indicadores baseados em EBITDA, dívida, margem bruta e ROIC
aparecem como "não se aplica".

**Valuation** (modelos de estudo, não são preço-alvo):
- **Graham**: √(22,5 × LPA × VPA).
- **Bazin**: dividendos por ação (média dos últimos 3 anos) ÷ rendimento mínimo (padrão 6%).
- **DCF**: FCF base (média de 3 anos de caixa operacional − capex) cresce por N anos, mais
  perpetuidade, descontados; menos dívida líquida e minoritários; ÷ ações. Premissas padrão:
  crescimento = CAGR de receita (0–12%), perpetuidade = IPCA 12m (2–6%), desconto = Selic + 3 p.p.
  Todas editáveis.

**Conferência**: `src/analytics/published.test.ts` compara os cálculos com números
publicados por WEG, Petrobras e Itaú em 2025, explicando as diferenças de metodologia.

**Units** (TAEE11, KLBN11, SANB11...): o preço é de um pacote de ações, então LPA, VPA, valuation e
projeções saem **por unit**, usando a composição informada no FCA da CVM.

## Relatório automático (sem IA)

A aba **Relatório** gera, sem custo, um relatório por regras fixas: resumo, placar por tema
(rentabilidade, dívida, crescimento, dividendos e preço frente aos pares), pontos positivos e de
atenção com os números, tendências e modelos de valuation. Você pode informar o **lucro estimado**
e o payout: o relatório calcula LPA, P/L projetado, dividendo por ação e rendimento na hora.
O botão **Exportar PDF** abre a impressão do navegador; escolha "Salvar como PDF".

## Projeções

Aba **Projeções** na página da empresa e página `/projecoes` com todas as salvas. São estimativas
**suas**, sempre marcadas como tal e separadas dos dados oficiais.

- Parte do lucro real de 12 meses, da quantidade de ações e do preço atual.
- Premissas: crescimento do lucro (ou receita × margem líquida), payout, anos e P/L no último ano.
  Os valores iniciais vêm do histórico, com a explicação ao lado.
- Lucro e payout podem ser digitados em qualquer ano; os anos seguintes partem do valor digitado.
- Resultado por ano: lucro, LPA, dividendos, dividendo por ação, dividend yield sobre o preço e sobre
  o seu preço médio (se a ação estiver na carteira) e P/L projetado.
- Cenários pessimista, base e otimista (±5 p.p. no crescimento), com preço implícito e retorno.
  O retorno não reinveste dividendos, e a quantidade de ações é mantida constante.
- O copiloto pode ler a projeção salva (ferramenta `projecoes_usuario`), sempre como estimativa sua.

## Copiloto com IA (Claude)

Abas **Copiloto** (chat) e **Relatório** na página de cada empresa. Precisa de
`ANTHROPIC_API_KEY` no `.env.local`; sem ela, as abas explicam como ativar.

- **A IA não "lembra" números.** Ela chama ferramentas (`src/ai/tools.ts`) que leem o banco
  local: resumo, indicadores (com fórmula, período e fonte), histórico anual/trimestral, pares do
  setor, Selic/CDI/IPCA, valuation, dividendos, linhas das demonstrações e uma calculadora para
  qualquer conta derivada.
- **Verificação de números:** cada resposta é conferida contra os números que as ferramentas
  devolveram (`src/ai/verify.ts`). O que não bate aparece marcado como "não verificado".
- **Regras do prompt** (`src/ai/prompts.ts`): citar período e fonte, dizer quando um dado falta ou
  não se aplica, não recomendar compra/venda e terminar com o aviso de que não é recomendação.
- **Modelos:** chat com `claude-sonnet-5-5` (esforço médio) e relatório com `claude-opus-5-5`
  (esforço alto), configuráveis por `CLAUDE_CHAT_MODEL` / `CLAUDE_REPORT_MODEL`. Usa fallback do
  servidor (`fallbacks: "default"`) se um modelo recusar, e cache do prompt (ferramentas + regras).
- **Relatórios** ficam salvos na tabela `ai_reports` com a data dos dados usados.
- `npm run check:ai-tools -- WEGE3` executa todas as ferramentas sem chamar a API, para ver o que a
  IA recebe.

## Limitações conhecidas

- **Capex e dividendos pagos** vêm de linhas de texto livre do fluxo de caixa, então são estimativas.
- **Yahoo Finance não é uma API oficial:** pode mudar sem aviso, e seus termos restringem uso
  automatizado. O app faz poucas chamadas (cada ticker no máximo uma vez por semana, ou uma vez por
  dia ao abrir a empresa) e é para uso pessoal.
- **Dividend yield de empresas sem histórico de proventos** é estimado pelo fluxo de caixa e pode
  distorcer quando pagamentos de anos diferentes caem no mesmo período.
- **EBITDA e lucro são contábeis**, sem os ajustes que as empresas costumam divulgar.
- **Quantidade de ações:** as companhias em que a escala não pode ser conferida ficam sem indicadores
  por ação. Grupamentos recentes também podem impedir a conferência até o próximo balanço.
- **Holdings** têm margens sem significado, porque o resultado vem de equivalência patrimonial.
- **Cotações** do plano gratuito da brapi têm atraso de cerca de 30 minutos.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| "no such column" depois de atualizar o projeto | Rode `npm run db:migrate` e reinicie o app |
| Página inicial pede para baixar dados | Rode `npm run setup` |
| Copiloto aparece desativado | Preencha `ANTHROPIC_API_KEY` no `.env.local` e reinicie o app |
| Gráfico de cotação sem dados | Rode `npm run ingest:market -- --ticker WEGE3` e veja o erro |
| Erro de instalação com caminho longo no Windows | Mova o projeto para uma pasta curta |
| Quer forçar a atualização dos balanços | `npm run ingest:cvm -- --force` |

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
| `npm run setup` | cria o banco e faz a primeira carga completa de dados |
| `npm run dev` | servidor de desenvolvimento |
| `npm run db:migrate` | cria/atualiza o banco local |
| `npm run ingest:cvm` | baixa cadastro, tickers e DFP/ITR da CVM (~11 anos; só rebaixa o que mudou) |
| `npm run ingest:cvm -- --from 2024 --force` | recoleta a partir de um ano, mesmo sem mudanças |
| `npm run ingest:market` | Selic/CDI/IPCA (Banco Central) + cotações do dia (brapi) + conferência da quantidade de ações |
| `npm run ingest:market -- --ticker WEGE3` | histórico de 10 anos e proventos de um ticker (Yahoo Finance) |
| `npm run worker` | agendador: mercado nos dias úteis às 19h30, CVM todo dia às 7h; recupera atrasos ao iniciar |
| `npm run dev:all` | app + agendador juntos |
| `npm run show -- WEGE3` | mostra os indicadores de um ticker no terminal |
| `npm run check:ai-tools -- WEGE3` | executa as ferramentas da IA sem chamar a API |
| `npm test` | testes |
| `npm run validate` | lint + tipos + testes + build (o mesmo que a CI) |
