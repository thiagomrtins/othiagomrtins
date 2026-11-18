# Busca Viral

Encontre os vídeos mais virais do TikTok no seu nicho: busca por assunto, filtro de português ou
global, todos os vídeos encontrados na busca (cerca de 22 em português) por curtidas, top 5 comentários sob demanda e um bloco "Em alta no TikTok" com
buscas, hashtags e temas.

## Rodar no seu computador

```bash
npm install
cp .env.example .env      # preencha APIFY_TOKEN
npm run dev
```

Sem `APIFY_TOKEN` o app abre em modo demonstração (dados fictícios, custo zero).

## Publicar na Vercel

1. Importe o repositório em vercel.com.
2. Em **Settings → Environment Variables**, cadastre as variáveis do `.env.example`
   (`APIFY_TOKEN` é a obrigatória). Marque como **Sensitive**.
3. **Redeploy**: variável nova só vale no próximo deploy.
4. Ligue **Deployment Protection** enquanto testa.

## Quanto custa

| Ação | Custo aproximado |
|---|---|
| Busca em português (vídeos + frases) | US$ 0,16 |
| Ver comentários de um vídeo | US$ 0,017 |
| Resultado já em cache | US$ 0 |

O plano gratuito do Apify tem US$ 5 por mês. Por isso o cache e os tetos abaixo importam.

## Segurança (resumo do que está implementado)

- **Chaves só no servidor.** Nada de `APIFY_TOKEN` chega ao navegador; o `.env` está no `.gitignore`.
- **Tetos de custo em três camadas:** limite por IP por minuto, teto diário global
  (`DAILY_*_LIMIT`) e teto de dólares por execução no Apify (`maxTotalChargeUsd`).
- **Execução que falha ou demora é abortada**, para não continuar cobrando sem ninguém usar.
- **Redis opcional (Upstash)** para cache e limites compartilhados entre instâncias.
  Sem ele a proteção funciona só dentro de cada instância.
- **Entrada validada:** assunto de 2 a 80 caracteres sem caracteres de controle; a rota de
  comentários só aceita links de vídeo do TikTok; links e capas vindos do TikTok são conferidos
  antes de aparecer na tela.
- **Bloqueio de outros sites:** a API recusa chamadas que o navegador marca como vindas de outro
  site (`Sec-Fetch-Site`), para ninguém usar o navegador de um visitante contra o seu saldo.
- **Cabeçalhos de segurança:** política de conteúdo (CSP), HSTS, `nosniff`, `frame-ancestors 'none'`,
  `Referrer-Policy`, `Permissions-Policy` e `COOP`.
- **Dependências:** `npm audit` sem vulnerabilidades conhecidas.

### Limites conhecidos

- A política de conteúdo precisa de `'unsafe-inline'` em scripts (o Next.js usa scripts inline
  para carregar a página). Trocar por nonce exige renderizar tudo no servidor a cada visita.
- Sem Redis, o cache e os limites não são compartilhados entre instâncias.
- Não há login: quem tem o link usa o app. Use Deployment Protection ou adicione login antes de
  divulgar.
- O ranking "Em alta" usa a ordem de sugestão do TikTok, e não um volume de buscas.

## Testes

```bash
npm run check    # tipos + testes
```
