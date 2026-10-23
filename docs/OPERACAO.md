# Operação e release

1. Use PostgreSQL externo com TLS validado e banco separado para desenvolvimento, preview e produção. Não copie `.local/postgres` para o servidor. O banco embarcado serve exclusivamente ao ambiente local/testes.
2. Aplique `pnpm db:migrate` com usuário de migração. A migração inicial não apaga tabelas existentes. Use usuário runtime sem privilégios DDL/superuser e sem TRUNCATE em auditoria/histórico.
3. Configure `APP_ORIGIN`, chave AES de 32 bytes, SMTP, secret dos jobs e settings do proxy. Não rotacione a chave AES sem migrar os segredos TOTP e e-mails pendentes existentes.
4. Configure jobs a cada minuto via CLI ou POST autenticado. Teste expiração com duas execuções concorrentes e monitore atraso da outbox, tentativas >=10, reservas vencidas e pedidos PAYMENT_REVIEW.
5. O controle de estoque não depende de memória do processo. Pool padrão: 5 conexões por instância, conexão até 5 s, SQL até 8 s, locks até 5 s. Dimensione pooler/limites do PostgreSQL ao número de instâncias.
6. Configure snapshots e PITR no serviço de banco. Ensaie `pg_dump --format=custom` e restauração com `pg_restore` **em banco de staging novo**, confira contagens, estoque/reservas, histórico, e teste login 2FA usando a chave correta. Backup de dados pessoais deve ser criptografado e ter acesso restrito. Este ensaio não foi realizado num provedor externo nesta entrega.
7. Faça build, testes e smoke test em preview antes de produção. No rollback, reverta o código para uma versão compatível com o schema. Não apague dados ou execute migração destrutiva para desfazer um deploy.

## CI

`.github/workflows/ci.yml` instala via pnpm, roda lint, typecheck, testes PostgreSQL isolados, build e E2E com banco próprio. Nenhuma credencial de produção é necessária. O navegador precisa das dependências de sistema; a execução em ambientes restritos pode ser limitada por políticas de sandbox.

## Observabilidade

Health check: GET `/api/health`, somente `{status:ok}` ou indisponibilidade, sem versão/credenciais. Auditoria no banco é imutável pela aplicação. Falhas de e-mail registram apenas identificador opaco e tipo de evento. Configure alertas externos para erro 5xx, conexões/pool, latência e job sem execução. Não registre corpos de login, cookies, OTP, URLs com tokens ou payloads completos de provedores.

## Artefatos originais

`dist/index.html`, `server.mjs` e `.sites-checkout` foram preservados como referência do protótipo. A nova loja está em `src/`. Não houve deploy no Sites ou na Vercel; o backend solicitado usa Node.js/PostgreSQL. A skill Sites orientou continuidade visual e prévia local, sem trocar a arquitetura do plano por Workers.
