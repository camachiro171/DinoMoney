# 🦖 DinoMoney

Gestão financeira pessoal pelo WhatsApp. A pessoa manda um texto, uma foto de cupom, um print do app do banco ou o PDF do extrato, e o DinoMoney lê, classifica nas categorias da mentoria e lança no fluxo de caixa.

## O que esta primeira versão faz

- Recebe mensagens no WhatsApp (API oficial da Meta).
- Entende **texto**, **foto/print** e **PDF** (extrato ou fatura com vários lançamentos de uma vez). Áudio ainda não.
- Classifica usando as categorias da aba **Contas** da planilha de cada pessoa (Essencial / Necessária / Supérflua / Renda), mais as categorias próprias que a pessoa já usa no fluxo. Também olha os lançamentos recentes para repetir o jeito como ela classifica cada estabelecimento.
- Grava na aba **Cashflow** da planilha Google da pessoa, logo abaixo do último lançamento, preenchendo DATA, DESPESA, Descrição, NOME, PAGO COM, Banco e VALOR. Se TIPO e CAIXA já têm fórmula, ficam como estão; se estão vazios, o robô preenche o TIPO e a fórmula do saldo acumulado.
- **Cartão de crédito**: a compra entra no caixa na data de vencimento da fatura, considerando o dia de fechamento. Parcelado vira uma linha por parcela.
- Saída sempre negativa, entrada sempre positiva, Renda sempre positiva.
- Responde no WhatsApp confirmando o que lançou. A pessoa pode mandar **desfazer** para apagar o último envio.
- Guarda um registro numa aba oculta `DinoMoney_log` na planilha, para o "desfazer" e para não lançar a mesma mensagem duas vezes.

## Como funciona

```
WhatsApp ──► /api/whatsapp (este app) ──► Claude lê e classifica ──► Planilha Google
    ▲                                                                     │
    └──────────────────── mensagem de confirmação ◄──────────────────────┘
```

| Arquivo | Para quê |
|---|---|
| `src/app/api/whatsapp/route.ts` | Recebe as mensagens da Meta e confere a assinatura |
| `src/lib/bot.ts` | Decide o que responder (comandos, foto, PDF, texto) |
| `src/lib/classificador.ts` | Conversa com a IA e define as regras de classificação |
| `src/lib/lancamentos.ts` | Transforma o que a IA entendeu em linhas da planilha (sinal, parcelas, cartão) |
| `src/lib/datas.ts` | Datas, fechamento e vencimento de fatura |
| `src/lib/planilha.ts` | Lê categorias e grava no Google Sheets |
| `src/lib/whatsapp.ts` | Baixa fotos/PDFs e envia mensagens |

## Colocando no ar (passo a passo)

### 1. Chave da IA
Crie uma chave em https://platform.claude.com (API Keys) e guarde para o passo 5 (`ANTHROPIC_API_KEY`).

### 2. Conta de serviço do Google
1. Em https://console.cloud.google.com crie um projeto e ative a **Google Sheets API**.
2. Em *IAM e administrador > Contas de serviço*, crie uma conta e gere uma chave **JSON**.
3. Abra cada planilha de mentorado e **compartilhe como Editor** com o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`).
4. O conteúdo do JSON vai em `GOOGLE_SERVICE_ACCOUNT_JSON` (numa linha só).

### 3. WhatsApp (número de teste da Meta)
1. Em https://developers.facebook.com crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em *WhatsApp > Configuração da API* pegue o **token** (`WHATSAPP_TOKEN`) e o **ID do número de telefone** (`WHATSAPP_PHONE_NUMBER_ID`). Cadastre ali o celular de quem vai testar (no número de teste só números cadastrados recebem resposta).
3. Em *Configurações do app > Básico* copie a **Chave secreta do app** (`WHATSAPP_APP_SECRET`).
4. Invente uma senha qualquer para `WHATSAPP_VERIFY_TOKEN`.
5. O token temporário expira em 24h. Para o piloto, gere um token permanente em *Configurações do negócio > Usuários do sistema*.

### 4. Usuários do piloto
Em `DINOMONEY_USUARIOS`, uma lista com cada pessoa: telefone, ID da planilha (o trecho da URL entre `/d/` e `/edit`), nome da aba do fluxo, contas e cartões. Veja o exemplo em `.env.example`.

### 5. Publicar
O jeito mais simples é a **Vercel** (https://vercel.com): importe este repositório do GitHub, cole as variáveis do `.env.example` em *Settings > Environment Variables* e publique.

Depois, na Meta, em *WhatsApp > Configuração*, configure o webhook:
- URL: `https://SEU-APP.vercel.app/api/whatsapp`
- Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN`
- Assine o campo **messages**.

## Para desenvolver

```bash
npm install
cp .env.example .env.local   # e preencha
npm test                     # testes automáticos
npm run dev                  # sobe em http://localhost:3000
npm run simular -- "mercado 230 no nubank em 2x"   # testa só a IA (precisa de ANTHROPIC_API_KEY)
```

## Segurança

- Só a Meta consegue chamar o webhook: cada requisição tem a assinatura conferida com a chave secreta do app.
- Só números cadastrados em `DINOMONEY_USUARIOS` são atendidos; cada número só escreve na própria planilha.
- Fotos e PDFs não são guardados: são lidos e descartados. Ficam só as linhas na planilha.
- Nenhuma senha de banco é pedida ou guardada. Chaves ficam nas variáveis de ambiente, nunca no código.

## Próximos passos

- Áudio (transcrição)
- Cadastro de usuários e cartões por uma tela, em vez de variável de ambiente
- Banco de dados próprio e painel web, com a área do mentor
- Resumo semanal no WhatsApp com as metas da aba Contas
