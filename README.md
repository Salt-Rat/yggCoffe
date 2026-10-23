# Grão na Porta · yggCoffe

Loja em Next.js/React/TypeScript, API GraphQL e PostgreSQL. O projeto usa **somente pnpm**, com dependências fixadas em `pnpm-lock.yaml`. Node.js 22 ou superior.

## Rodar localmente

```sh
pnpm install
```

Crie `.env` a partir de `.env.example`. Gere `MFA_ENCRYPTION_KEY` com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e guarde o valor somente no arquivo local ou no gerenciador de secrets. Essa chave também protege os e-mails pendentes. Não há senha administrativa padrão.

O ambiente desta implementação já tem `.env` local, chave aleatória e banco inicializado. Nunca reutilize essas credenciais locais em produção.

Escolha uma das opções para o PostgreSQL:

```sh
# PostgreSQL local, sem Docker (deixe este terminal aberto)
pnpm db:local

# Alternativa com volume persistente
docker compose up -d
```

Ambas usam a porta local 54329; execute apenas uma. Em outro terminal:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abra `http://localhost:3000`. Use exatamente a origem definida em `APP_ORIGIN`. Para acessar por IP da rede, configure essa origem, reinicie a aplicação e configure `allowedDevOrigins` no Next.js para o host usado no desenvolvimento. Não há wildcard de origens para a API.

O seed é idempotente, não sobrescreve edições do admin e cria três cafés **demonstrativos, com estoque zero**. Os preços, nomes e origem genérica devem ser revisados antes de vender. Os perfis iniciais reproduzem a tabela enviada: Clara (Frutado e Floral / Alta / Leve / Sutil / Baixo / V60), Média (Doce e Equilibrado / Média / Médio / Alta / Médio / Versátil), Escura (Intenso e Tostado / Baixa / Encorpado / Baixa / Alto / Espresso e Prensa Francesa).

## Administrador

```sh
pnpm admin:create
```

O comando solicita nome, e-mail, senha de no mínimo 16 caracteres e confirmação de um autenticador TOTP. A entrada de senha/código é oculta. A chave TOTP é exibida apenas nesse terminal para cadastro no autenticador. Não crie o admin com credenciais enviadas no chat. O comando não promove nem sobrescreve contas existentes.

Entre em `/conta`, abra **Acesso administrativo · código 2FA** e informe senha + código. Acesse `/admin`:

- **Catálogo:** índice exclusivo definido pelo admin, ordem na loja, slug, descrição, categoria, torra, imagem e variantes com SKU, preço em centavos, estoque e ativação. Desative produtos/variantes sem apagar históricos.
- **Torras & landing:** escolha a torra do mês, título, identificação da seleção, imagem e os seis atributos de cada perfil. Alterações aparecem na landing e na comparação.
- **Pedidos:** detalhes do cliente, endereço de entrega, itens e progressão pago → em preparo → enviado (com rastreio) → entregue. Leituras de detalhes ficam auditadas.
- **Auditoria:** histórico imutável de acessos e alterações.
- **Segurança:** reautenticação com senha + TOTP e encerramento da sessão.

Alterações exigem um **novo código TOTP**, além de cookie e CSRF, e confirmação de identidade nos últimos 10 minutos. Aguarde o próximo código após login ou outra ação. A sessão admin expira em uma hora ou 15 minutos de inatividade. Não existe endpoint de elevação de papel nem autenticação por bearer token administrativo. Recuperar senha não remove o 2FA. Para perda do autenticador, use o procedimento operacional em `docs/SEGURANCA.md`.

Imagens podem ser substituídas por URLs HTTPS de object storage ou arquivos colocados em `public/images/`. Não há upload público nem interpretação de SVG/HTML enviados por visitantes. O grão gerado está em `public/images/coffee-bean.png`; os três perfis usam tonalidades diferentes como valores iniciais. Veja `docs/ASSETS.md`.

## Funcionalidades

`/` landing com grão animado pela rolagem e comparação; `/loja` busca, filtros e paginação; `/loja/[slug]` detalhes e variantes; `/carrinho` sacola persistente anônima/autenticada; `/checkout` endereço, revisão e pagamento quando integrado; `/conta` cadastro, login, recuperação, confirmação de e-mail, perfil, endereços, pedidos e cancelamento pendente; `/admin` painel protegido.

A sacola anônima usa cookie HttpOnly. Ao entrar, os itens são mesclados com a sacola da conta. O preço final é sempre recalculado no backend. A confirmação por link de e-mail acontece via ação explícita, e os tokens são de uso único. Tokens de e-mail ficam no fragmento da URL, removido após leitura, para evitar logs e referrers.

## Pagamentos: ponto de integração preparado, sem cobrança ativa

**Mercado Pago e InfinitePay ainda não estão conectados.** A finalização retorna `PAYMENT_UNAVAILABLE` até a equipe implementar e registrar um adaptador real em `src/lib/payments.ts`. Só preencher uma chave no `.env` não habilita cobrança. Não há gateway de teste acessível em produção.

O contrato, webhook, idempotência, reserva, confirmação, expiração e estado de revisão já estão implementados. Siga `docs/PAGAMENTOS.md` para conectar o provedor, com seus ambientes sandbox, credenciais e validação de assinatura específica. As credenciais de pagamento nunca vão ao frontend.

O frete precisa de `DELIVERY_FLAT_RATE_CENTS` definido com uma política real de entrega. A implementação inicial usa valor fixo configurável, não consulta transportadoras. Sem valor configurado o checkout permanece bloqueado. Assinaturas recorrentes, cupons, reembolso automático e cálculo de frete por CEP ficam fora desta entrega.

## E-mail e tarefas

Configure SMTP e `SMTP_FROM`. Os e-mails de confirmação, recuperação e pagamento ficam em uma outbox transacional criptografada. Sem SMTP, a aplicação não afirma que o envio foi concluído; as mensagens ficam pendentes. O worker envia até dez mensagens por execução, com lease, tentativas limitadas e `Message-ID` estável. SMTP oferece entrega pelo menos uma vez; falha após aceitação pelo servidor pode gerar duplicata.

```sh
pnpm worker
```

Agende essa execução **a cada minuto**, ou chame `POST /api/jobs` com `Authorization: Bearer <CRON_SECRET>` usando um agendador externo. Gere um secret aleatório de 32 bytes. O job libera reservas expiradas, limpa sessões/tokens/limites antigos e despacha a outbox. Sem o agendador, o estoque não será revendido indevidamente, mas pode continuar reservado além do prazo até a execução do job. Não há processo persistente embutido na função Vercel.

## Verificação

O laboratório ampliado de segurança, CRUD via HTTP, SMTP local e Docker completo está em [docs/TESTES_INTEGRACAO.md](docs/TESTES_INTEGRACAO.md). Execute `pnpm test:docker` para a suíte isolada; `pnpm docker:up` sobe a loja no engine atual em `http://localhost:18080`, e `pnpm test:e2e:docker` testa essa instalação no navegador. Para selecionar explicitamente o Docker Desktop, use `pnpm docker:desktop up -d --no-build --wait` após construir as imagens com `pnpm docker:desktop build app proxy`. O relatório da avaliação está em [docs/PENTEST_LOCAL.md](docs/PENTEST_LOCAL.md).

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Os testes de integração sobem um PostgreSQL real isolado na porta 54339 e removem apenas seu diretório temporário ao terminar. Não usam nem limpam o banco local da loja. E2E requer aplicação/banco com seed, cria usuários de teste no banco apontado pelo servidor e deve rodar em ambiente de teste. Use `E2E_BASE_URL` para apontar para um servidor já ativo e `PLAYWRIGHT_EXECUTABLE_PATH` para um navegador instalado.

Os testes cobrem última unidade concorrente, retries simultâneos, preço/snapshot, BOLA/IDOR, validação dos eventos de pagamento, pagamento tardio, cancelamento simultâneo, duplicidade, rate limit compartilhado, CSRF, 2FA/replay, logout e limites GraphQL. Não substituem a homologação real do provedor.

## Deploy e operação

Build/start padrão Next.js: `pnpm build` e `pnpm start`. Na Vercel, selecione Next.js, use `pnpm install --frozen-lockfile`, PostgreSQL externo com TLS validado e pooler apropriado, e secrets distintos para preview/produção. Rode migrações como etapa de release, não em cada requisição. Não envie `.env`, `.local`, uploads privados nem dados de teste.

Ative HTTPS, configure o proxy/WAF e limites de borda. Só ative `TRUST_PROXY=true` quando o proxy sobrescrever o header indicado por `TRUSTED_IP_HEADER`. Sem isso a aplicação usa um bucket de IP compartilhado seguro, que reduz capacidade e evita aceitar IPs forjados. Confirme a semântica do header na hospedagem antes de habilitar.

Antes de vendas reais: integrar/homologar gateway, configurar SMTP/frete/jobs, criar admin, revisar catálogo e informações empresariais/privacidade, usar role PostgreSQL sem DDL/superuser, e ensaiar backup/restauração em staging. A loja não foi publicada nem conectada a serviços de produção nesta implementação. `dist/index.html` e `server.mjs` preservam o protótipo antigo; o comando `pnpm dev` agora inicia a aplicação completa.

Arquivos de referência: `PLANO_APLICACAO_LOJA_ONLINE.md`, `docs/SEGURANCA.md`, `docs/PAGAMENTOS.md`, `docs/OPERACAO.md`.
