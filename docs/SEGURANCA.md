# Controles e limites

## Identidade

Auth adaptado conceitualmente de `/home/ask/astrovale/apps/api/src/auth.ts`: Argon2id (19 MiB, duas iterações), tokens opacos aleatórios de 256 bits e apenas SHA-256 da sessão no banco. Nenhum dado/secret do Astrovale foi copiado. Cookies HttpOnly/SameSite=Strict e, em produção, Secure com prefixo `__Host-`. Token da sessão nunca é exposto no JS/localStorage.

Mutações GraphQL: origem exata configurada, JSON e token CSRF ligado à sessão. O token CSRF é obtido em endpoint same-origin sem cache. Visitantes anônimos têm Origin + header obrigatório para mutações. Sem CORS permissivo. Endpoints não usam `role`, `userId` ou cabeçalho Authorization do cliente para escolher permissões.

Admin exige TOTP no login. Segredo criptografado com AES-256-GCM; step usado guardado atomicamente para evitar replay. Escritas exigem TOTP novo, sessão ainda válida e papel atual no banco, confirmação de identidade há menos de dez minutos, e logs na mesma transação. User-agent vinculado à sessão admin, timeout absoluto de uma hora e ocioso de 15 min. Não há refresh token administrativo persistente.

Alterações/recuperação de senha revogam sessões e preservam MFA. Login/reautenticação bloqueiam a linha do usuário e conferem que a senha não foi alterada entre a verificação Argon2 e a emissão da sessão. A política admin não considera apenas uma autorização carregada antes de uma revogação concorrente.

## Limites compartilhados

Rate limit usa UPSERT atômico no PostgreSQL, compartilhado entre instâncias serverless. Valores iniciais:

| Escopo | Limite |
|---|---|
| API GraphQL por IP | 180/min |
| Ator (usuário ou visitante) | 120/min |
| Mutações por ator | 40/min |
| Login por IP / por e-mail | 20/15 min / 8/15 min |
| Cadastro por IP | 5/h |
| Reset por IP / e-mail | 5/15 min / 3/h |
| Reautenticação admin | 5/15 min |
| Escritas admin | 20/5 min |
| Checkout por usuário | 10/10 min; até 3 pedidos pendentes |

Sem Redis adicional obrigatório. Para alto volume, o limiter pode migrar para Redis mantendo política fail-closed e testes. Isso não substitui WAF/DDoS na hospedagem: conexões, tráfego volumétrico, SSR e assets precisam de proteção na borda antes de chegar ao processo/banco. Não use headers de IP sem proxy confiável; por padrão há um bucket compartilhado em vez de aceitar spoofing.

GraphQL: POST JSON, corpo máximo 32 KiB, documento 16 mil caracteres/2500 tokens, uma operação, uma mutação raiz, até oito campos raiz de consulta, 180 campos expandidos contando fragments, profundidade sete, listas paginadas até 30 e resposta até 256 KiB. Fragmentos recursivos e batching rejeitados. Introspection indisponível em produção. Os erros não incluem SQL, stack, credenciais ou mensagens brutas dos gateways.

CSP com nonce por resposta para scripts, `strict-dynamic`, frame-ancestors none, object-src none, base-uri self, headers anti-sniffing e HSTS em produção. `unsafe-eval` só no desenvolvimento; styles inline são permitidos para layout/animação. React escapa texto editável. Imagens são URLs HTTPS ou caminhos sob `/images/`; não são buscadas pelo servidor, evitando SSRF de importação. Não há upload executável público.

## Estoque e pedidos

PostgreSQL é a fonte de verdade. `stock` é total físico, `reserved` é parcela temporária, disponível é `stock-reserved`. CHECKs impedem estoque/reservas negativos ou reserva maior que total. Checkout bloqueia variantes em ordem estável; edições não podem reduzir total abaixo do reservado. Transações abortadas devolvem todas as reservas.

Chave idempotente única por cliente + fingerprint do carrinho/endereço. Payload com preços ou IDs de proprietário extras é rejeitado. Pedido guarda snapshots de SKU/nome/preço/endereço; alterações futuras não reescrevem compras passadas. Leitura e cancelamento de cliente sempre incluem `user_id` da sessão na consulta SQL. Suporte não ganha acesso administrativo implicitamente.

Histórico e auditoria têm triggers que rejeitam UPDATE/DELETE. Em produção, o usuário da aplicação não deve ser dono das tabelas, superuser, nem ter DDL/TRUNCATE/ALTER; caso contrário poderia contornar triggers. Use um usuário separado para migrações. Secrets devem estar em gerenciador próprio e a chave de criptografia precisa de backup seguro e plano de rotação.

## Recuperação de acesso administrativo

Não existe recuperação de MFA por e-mail ou endpoint público. Guarde o segredo TOTP inicial num cofre com controle de acesso. Em perda/incidente, o operador autorizado deve confirmar a identidade fora da aplicação, revogar todas as sessões da conta, registrar o atendimento em auditoria e efetuar a troca de segredo no ambiente administrativo do banco com sua política operacional. Não crie uma rota de desativação de MFA baseada apenas em token de sessão/reset. Uma equipe pode acrescentar recovery codes com hashes e consumo único depois de definir a política.

## Limites conhecidos

Não se promete segurança absoluta. Há pontos de operação ainda não configurados: WAF, alertas, monitoração de logins malsucedidos, backups/PITR, entrega real de e-mails, recuperação assistida de MFA e gateway. A página de privacidade é uma base funcional e precisa dos dados/política da empresa. Os endpoints de reembolso e promoção de usuários não existem nesta entrega.
