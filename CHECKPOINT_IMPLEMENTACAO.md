# Checkpoint — implementação da loja

Última atualização: 22/10/2026. Implementação e avaliação local de segurança retomadas após pausas. Não reiniciar o projeto do zero.

## Já implementado

- Next.js 16 / React / TypeScript / pnpm e PostgreSQL real.
- Landing preservando identidade visual; grão transparente gerado, rotação por scroll, três torras, ficha e tabela comparativa editáveis.
- Catálogo, variantes, índices definidos pelo admin, sacola persistente, conta, recuperação/verificação de e-mail, endereços, checkout e pedidos.
- Sessões HttpOnly, Argon2id, CSRF, rate limit compartilhado, TOTP admin obrigatório com proteção contra replay e reautenticação.
- Estoque transacional, concorrência da última unidade, idempotência, eventos de pagamento, expiração e revisão de pagamentos tardios.
- Painel de catálogo/torras/pedidos/auditoria, bootstrap administrativo por CLI, jobs/outbox, migrações/seed, CI e documentação.
- Adaptadores comerciais preparados por contrato; Mercado Pago e InfinitePay deliberadamente não habilitados sem implementação/homologação da equipe.
- CRUD de endereços, desativação de cliente mediante senha, arquivamento de produto com 2FA e testes HTTP reais de contas/catálogo/pedidos.
- Correções de limites GraphQL, ordem de locks de tokens, variantes, concorrência de arquivamento/checkout e tratamento do pool PostgreSQL. Detalhes em `docs/PENTEST_LOCAL.md`.
- Docker completo: app Next em produção, PostgreSQL, migração, worker contínuo e nginx; laboratório isolado com PostgreSQL e Mailpit. Comando `pnpm docker:desktop` seleciona explicitamente o Desktop, sem alterar o contexto global.

## Verificações finais

- `pnpm typecheck` e `pnpm lint`: passaram após os ajustes finais.
- `pnpm test`: 42 testes passaram com PostgreSQL temporário real.
- `pnpm test:integration`: 27 testes HTTP passaram, incluindo SMTP real ao Mailpit, última unidade concorrente, idempotência, 2FA, isolamento entre contas e CRUD. JSON em `test-results/http-integration.json`.
- `pnpm test:e2e:docker`: repetição final aprovada com dez cenários na imagem atualizada do Docker Desktop (cinco desktop e cinco mobile), incluindo cadastro, login, perfil, endereços, desativação, cookies Secure/HttpOnly/SameSite, CSRF e replay após logout. Resumo em `test-results/browser-summary.json`.
- `pnpm build`: compilação de produção passou dentro da reconstrução Docker. A interrupção anterior encerrou o comando de build com 143 durante o desempacotamento, depois de exportar/nomear a imagem. A imagem resultante foi validada com contêiner sem rede, atualização dos serviços e testes de navegador: pnpm 10.33.4, UID 1000, Corepack sem downloads.
- `pnpm audit --prod --audit-level=high`: nenhuma vulnerabilidade conhecida reportada.
- Teste do proxy aprovado: introspecção 400, origem inválida 403, método inválido 405, corpo grande 413; rajada local de 80 requisições recebeu respostas 200 e 429, mesmo com headers de IP forjados. Distribuição exata da execução em `test-results/proxy-security.json`.
- Total de 79 testes automatizados aprovados, mais verificações de proxy e inicialização offline. App em produção, PostgreSQL saudável, worker executando ciclos, migração finalizada e acesso externo ao contêiner com HTTP 200.

## Entrega e continuidade

Esta retomada está concluída. A nova imagem foi testada sem rede, os serviços foram atualizados preservando o volume e os testes finais passaram. Relatório consolidado em `docs/PENTEST_LOCAL.md`; comandos e limites do laboratório em `docs/TESTES_INTEGRACAO.md`. A loja e o laboratório foram deixados ativos para inspeção. Não reconstruir/reimplementar do zero após reset.

Depois da validação local, operação real ainda exige admin com credenciais próprias, catálogo/estoque reais, SMTP, frete e homologação do adaptador comercial/reconciliação. Não houve publicação externa nem cobrança real.

## Ambiente e cuidado com dados

- Workspace: `/home/ask/yggCoffe`; referência Astrovale apenas lida, não modificada.
- `.env` local gerado com chave aleatória, ignorado; não copiar/expor seu conteúdo.
- Loja no Docker Desktop: projeto `yggcoffe`, volume `yggcoffe_coffee_data`, acesso `http://localhost:18080`, PostgreSQL publicado em loopback 54329. A porta 8080 pertence a outro serviço e não foi alterada. Migração e seed aplicados; produtos DEMO com estoque zero.
- `pnpm docker:desktop ps` inspeciona; `pnpm docker:desktop up -d --no-build --wait` inicia a imagem existente; `pnpm docker:desktop stop` para preservando o volume. Não executar `down -v`.
- O daemon Linux é separado do Desktop. Nele estão `yggcoffe-integration-postgres-test-1` (54340, tmpfs) e Mailpit (SMTP 1026/caixa web 8026). `pnpm test:integration` usa esse laboratório; `pnpm test:docker` o inicia se necessário. Não trocar engines nem migrar volumes implicitamente.
- Banco antigo sem Docker preservado em `.local/postgres`; não iniciar `pnpm db:local` enquanto a porta 54329 estiver usada pelo Desktop. Desenvolvimento Next local continua disponível em 3000, mas não está sendo usado nesta validação.
- PostgreSQL dos testes de domínio é temporário na porta 54339; não limpa dados da loja.
- Produtos DEMO têm estoque zero. Não existe admin padrão: usar `pnpm admin:create`.
- Contas sintéticas `@example.test` usadas pelo navegador são desativadas ao final do cenário; auditoria é preservada. Administradores de teste existem apenas no laboratório isolado.
- Não houve publicação nem alteração de outros projetos do Docker. Preservados o plano, `dist/index.html`, `server.mjs` e `.sites-checkout`.
- Leia `AGENTS.md` e documentação local do Next em `node_modules/next/dist/docs/` antes de alterar convenções do framework.
