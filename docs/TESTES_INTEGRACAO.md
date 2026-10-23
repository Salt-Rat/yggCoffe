# Testes de integração e laboratório Docker

Use apenas bancos locais/staging. Nenhum cenário faz cobrança real ou envia e-mail para a internet.

## Executar

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:docker
```

`pnpm test` usa PostgreSQL temporário na porta 54339. `pnpm test:docker` inicia o projeto Compose separado `yggcoffe-integration`: PostgreSQL 17 na porta 54340, banco `ygg_http_test`, armazenamento temporário; Mailpit nas portas 1026 (SMTP) e 8026 (caixa web). Todas as portas publicadas estão restritas ao loopback.

Após iniciar os serviços, repita somente `pnpm test:integration`. O banco precisa terminar em `_test`; nunca configure `TEST_DATABASE_URL` com dados reais. A suíte limpa os contadores de rate limit entre cenários e adia mensagens de cenários anteriores para isolar o teste SMTP. Essas operações ficam exclusivamente no banco de testes. Os dados sintéticos permanecem disponíveis para inspeção até o contêiner PostgreSQL ser parado/recriado; o armazenamento em tmpfs é descartável.

```sh
# Encerra SOMENTE o laboratório temporário; descarta seu banco sintético.
docker compose -f compose.test.yaml down
```

## O que é real e o que é simulado

- Requisições HTTP por sockets TCP, cookies, CSRF, login Argon2id, códigos TOTP, validação GraphQL, transações PostgreSQL, locks, migrações e SQL reais.
- A ponte HTTP da suíte invoca os mesmos handlers usados pelas rotas Next; ela não executa o middleware/renderizador do Next. Estes são verificados separadamente pelo Playwright contra a aplicação.
- O cadastro ocorre pela API. Verificação/recuperação usam o token criado pela aplicação, lido da outbox criptografada do banco isolado. Um cenário adicional entrega a mensagem pelo worker SMTP real ao Mailpit.
- A criação inicial dos administradores de teste substitui apenas o bootstrap interativo por fixtures de banco. O login administrativo e cada alteração protegida passam por senha/TOTP/CSRF reais. O código do passo anterior é usado no login e o atual na alteração; replay é testado explicitamente.
- Pagamento usa um servidor HTTP simulador exclusivo do arquivo de testes, com webhook HMAC. Esse formato **não representa** a assinatura Mercado Pago/InfinitePay. A URL de checkout de exemplo não é aberta e nenhuma chamada sai para provedores comerciais. O handler de produção continua sem adaptador habilitado.
- A expiração é acelerada alterando apenas o prazo do pedido sintético. O job de liberação e a reconciliação executam o código real.

## Matriz de cobertura

| Área          | Verificações                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conta/sessão  | Cadastro, duplicidade, validação de e-mail, login correto/incorreto, leitura/edição de perfil, logout, redefinição de senha, uso único de token, desativação com senha e revogação |
| Endereços     | Criação, leitura, edição, remoção, limite, isolamento entre usuários, snapshot do pedido preservado                                                                                |
| Catálogo      | Criação/edição/arquivamento com 2FA, índice/SKU, variantes repetidas/omitidas, estoque reservado, filtros e detalhes                                                               |
| Sacola        | Inclusão, leitura, alteração e remoção, limites, merge no login, preços definidos pelo servidor                                                                                    |
| Pedidos       | Criar/listar/consultar/cancelar, isolamento, última unidade concorrente, idempotência, edição/arquivamento concorrente, reserva/expiração                                          |
| Pagamento     | HTTP de checkout simulado, assinatura inválida, valor inválido, repetição de webhook, baixa única, pagamento tardio, produção sem simulador                                        |
| Administração | Login 2FA, sessão sem novo TOTP, replay, outro user-agent, autorização, auditoria, torra do mês e progressão de entrega                                                            |
| Abuso         | SQL injection como dado, mass assignment, CSRF, origem, batches, complexidade/recursão GraphQL, corpo grande, força bruta, IP forjado e Retry-After                                |
| Navegador     | Desktop/mobile, landing, catálogo, cadastro, persistência de sessão, login, CRUD de endereço/perfil, bloqueio de admin, desativação, cabeçalhos e rotas protegidas                 |

Não existe DELETE de pedidos pagos, auditorias ou eventos financeiros. Pedidos pendentes são cancelados; produtos são arquivados/reabilitados. Os três perfis de torra são registros fixos editáveis, não categorias livremente removíveis. Contas administrativas não podem ser excluídas pelo endpoint de autoatendimento do cliente.

## Aplicação completa em contêineres

Com `.env` configurado (especialmente `MFA_ENCRYPTION_KEY`):

```sh
pnpm docker:up
docker compose exec app pnpm db:seed
pnpm test:e2e:docker
```

Abra `http://localhost:18080`. A porta 8080 deste computador já pertence a outro serviço e foi preservada. Para escolher outra porta, ajuste conjuntamente `DOCKER_HTTP_PORT`, `DOCKER_APP_ORIGIN` e `E2E_BASE_URL` nos testes. O projeto contém proxy nginx, Next em modo produção, PostgreSQL, migração de inicialização e worker contínuo. O app roda como usuário não-root, sem capabilities, com limites de memória/CPU. O nginx limita corpos, tempos de leitura, conexões e taxa de API, e sobrescreve os headers de IP. O Node não tem porta publicada diretamente. O PostgreSQL ainda publica 54329 apenas em loopback para desenvolvimento. Não inicie simultaneamente `pnpm db:local` nessa mesma porta.

O seed não cria admin e não substitui catálogo existente. Para provisionar um admin real, use `docker compose exec app pnpm admin:create` e escolha credenciais próprias. O Playwright cria contas `@example.test`, desativa as contas ao concluir o cenário e preserva auditoria; rode-o somente em instalação de teste. Em caso de falha, uma conta sintética pode ficar ativa. Os testes de catálogo esperam o seed original com estoque zero.

`pnpm docker:stop` para os serviços sem remover o volume da loja. Não use `down -v` para a loja se quiser preservar dados. A configuração é um laboratório local, não um release público: produção requer HTTPS, segredos próprios, SMTP com TLS, gateway homologado, permissões mínimas no PostgreSQL, backups e revisão dos limites.

## Docker Desktop no Windows

Neste computador coexistem dois engines: o daemon Linux hospeda o laboratório descartável; o Docker Desktop hospeda a loja. Para não depender do contexto global, use:

```sh
pnpm docker:desktop build app proxy
pnpm docker:desktop up -d --no-build --wait
pnpm docker:desktop exec app pnpm db:seed
pnpm docker:desktop ps
pnpm test:e2e:docker
# Para parar somente a loja do Desktop, preservando o volume:
pnpm docker:desktop stop
```

O comando verifica que o destino é realmente Docker Desktop. Em WSL, utiliza a CLI Windows e o caminho UNC da distribuição atual, sem trocar o contexto global e sem tocar em outros projetos. Não execute `pnpm docker:up` em outro engine simultaneamente nas mesmas portas.

Com a loja ativa, `pnpm exec node scripts/check-docker-boundary.mjs` verifica introspecção desabilitada, origem inválida, método inválido, limite de corpo e uma rajada local de 80 requisições com headers de IP forjados. O comando recusa destinos fora de loopback. Execute separadamente do Playwright: a rajada consome temporariamente o bucket do proxy. O resultado fica em `test-results/proxy-security.json`.

O Playwright do Docker verifica também cookies `__Host-`/Secure/HttpOnly/SameSite, CSRF inválido e replay do cookie após logout. Seu resumo fica em `test-results/browser-summary.json`; os artefatos em `test-results/browser/` não apagam os relatórios HTTP/proxy. A imagem mantém o cache Corepack disponível ao usuário não-root e desabilita downloads do Corepack em execução.

O mesmo `compose.yaml` funciona com Docker Desktop. Ative **Use WSL 2 based engine** e **Settings → Resources → WSL Integration** para a distribuição do projeto. Confirme o destino com `docker info` antes de executar os comandos. O projeto aparece agrupado no painel Containers do Desktop somente quando criado no engine do Desktop, não em um daemon Linux separado. Veja a [documentação oficial de integração WSL](https://docs.docker.com/desktop/features/wsl/).

Não removemos motores Docker existentes nem migramos volumes automaticamente: uma mudança de engine não transfere os dados. A caixa de teste usa a [API oficial do Mailpit](https://mailpit.axllent.org/docs/api-v1/) para confirmar recebimento.
