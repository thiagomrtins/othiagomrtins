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

## Velocidade

- **Uma etapa só:** o botão "Buscar" já faz a busca com as frases sugeridas. Os chips ficam na tela
  para refinar, e "Refazer busca" liga quando a seleção muda.
- **Busca de vídeos em paralelo:** uma execução por frase, todas ao mesmo tempo. Quando a primeira
  termina, as outras têm 10 s para acabar; a que travar é abortada e o que ela já trouxe é aproveitado.
  O TikTok às vezes bloqueia uma tentativa e o Actor refaz, o que antes podia levar mais de 60 s.
  Medido: 12 s (antes 15 a 64 s).
- **Comentários em ~5 s** (antes ~30 s), com reserva automática.
- **Seção do YouTube** carrega em segundo plano e abre na hora do clique.
- **Cache:** buscas repetidas vêm da borda da Vercel, sem esperar.

## Quanto custa

| Ação | Custo aproximado |
|---|---|
| Busca em português (vídeos + frases) | US$ 0,16 (3 execuções de vídeos, de US$ 0,001 cada de início) |
| Ver comentários de um vídeo | US$ 0,003 (3 a 6 s; reserva mais lenta: US$ 0,0125) |
| Seção do YouTube (10 vídeos), pelo Apify | US$ 0,01 (~5 s) |
| Seção do YouTube, pela API do Google | US$ 0 (cota grátis diária) |
| Resultado já em cache | US$ 0 |

O plano gratuito do Apify tem US$ 5 por mês. Por isso o cache e os tetos abaixo importam.

## Seção do YouTube

No fim da página aparecem os 10 vídeos mais vistos do YouTube sobre o assunto buscado, em cards com
capa e título. O clique abre o vídeo no YouTube.

- A seção mostra um botão **"Buscar os vídeos mais vistos sobre o tema"**. Os vídeos são buscados em
  segundo plano assim que os resultados do TikTok aparecem, e os cards só abrem quando a pessoa clica
  (já prontos). Isso gasta uma busca de YouTube (~US$ 0,01) por pesquisa, mesmo sem clique. Para só
  buscar no clique, troque `PREFETCH_IN_BACKGROUND` para `false` em `src/components/YoutubeSection.tsx`.
- Com `YOUTUBE_API_KEY`, usa a API oficial do Google (~1 s, cota grátis).
- Sem a chave, usa o Actor `grow_media/youtube-search-api` do Apify (~5 s, ~US$ 0,01), e como último
  recurso o `streamers/youtube-scraper` (18 a 50 s, ~US$ 0,04).
- País BR e idioma pt são dicas para o YouTube, e não filtros: podem vir vídeos em outros idiomas.
- Links e capas são montados a partir do id do vídeo; nada do que a API devolve vira link direto.

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
