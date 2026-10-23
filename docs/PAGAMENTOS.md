# Integração de pagamentos

Estado atual: infraestrutura de comércio pronta e validada com adaptador exclusivo dos testes; nenhum adaptador comercial habilitado. O projeto usa o nome **InfinitePay**, correspondente ao provedor mencionado como Infinity Pay.

Implemente a interface `PaymentProvider` em `src/lib/payments.ts` para Mercado Pago ou InfinitePay. Registre explicitamente o adaptador no mapa `providers`, carregando credenciais somente do ambiente do servidor. `PAYMENT_PROVIDER` escolhe o adaptador. Nunca habilite um fake como fallback.

## Criar checkout

`createCheckout` recebe `orderId`, valor em centavos, BRL, prazo e chave idempotente. Use o ID do pedido como referência externa e chave de idempotência do provedor; a mesma chamada deve retornar a mesma cobrança. Se o provedor não oferecer essa garantia, implemente persistência e consulta por referência antes de retry. Não use floats no domínio. Faça a conversão exigida pelo SDK só na fronteira.

O pedido e a reserva são commitados antes da chamada externa. Um timeout é **ambíguo**: a cobrança pode existir; conserve a reserva e reenvie com a mesma chave. Não crie outra cobrança com uma chave nova. O frontend conserva essa tentativa em sessionStorage para retries.

Use timeouts limitados nas chamadas HTTP, sandbox para homologação, `external_reference` equivalente e URLs de retorno fixas da origem da aplicação. As URLs de checkout aceitas precisam ser HTTPS em subdomínios de `mercadopago.com.br`, `mercadopago.com` ou `infinitepay.io`; amplie a allowlist somente com documentação oficial do gateway. Não é aceito URL enviado pelo cliente.

## Webhook

Endpoint: `POST /api/webhooks/[provider]`. O adapter recebe o corpo original limitado a 64 KiB e os headers. Deve verificar a assinatura conforme documentação atual do provedor (incluindo timestamp/replay quando disponível), consultar o recurso na API autenticada do gateway e validar referência externa, conta recebedora/merchant, moeda e valor. O adapter devolve somente `VerifiedPaymentEvent`.

Não invente uma assinatura comum para os dois gateways. Se um gateway não assina callbacks, trate o callback apenas como aviso e obtenha os dados via API autenticada, usando comparação exata de conta, referência e valor antes de aceitar o evento. Caso o gateway não forneça garantias suficientes, não o habilite.

`processPaymentEvent` bloqueia o pedido no banco e registra `(provider,eventId)` com índice único. Confirmação válida baixa estoque e reserva uma única vez. Eventos FAILED não desfazem uma aprovação nem liberam uma reserva prematuramente. Redirects do navegador nunca confirmam pagamento.

O pagamento recebido antes de salvar a resposta de criação também é suportado: o evento verificado pelo adapter pode vincular o paymentId ao pedido, que é único por provedor. Uma resposta concorrente não sobrescreve a confirmação.

## Encerramento da reserva

Reserva dura 15 minutos. O provedor deve usar o mesmo prazo sempre que possível. Cancelamento local cancela apenas pedidos PENDING e libera a reserva. Se uma cobrança externa for paga depois de cancelada/expirada, o pedido vai a `PAYMENT_REVIEW`; nunca há baixa de estoque já disponibilizado para outro cliente.

Para colocar em produção, implemente também reconciliação periódica de intenções pendentes, cancelamento no provedor e o fluxo operacional de revisão/reembolso. Falha ou atraso de webhook precisa ser recuperável por consulta autenticada ao gateway. Não há botão que transforma manualmente um pedido em PAID.

## Homologação mínima

- Criar checkout e repetir a chamada após timeout, recebendo uma única cobrança.
- Webhook inválido, alterado, expirado e duplicado; conta/valor/moeda/referência errados.
- Webhook aprovado antes do retorno de criação, depois da expiração e após cancelamento.
- Dois clientes disputando a última unidade; snapshot de preço após edição do produto.
- Queda do worker, webhook fora de ordem e reconciliação sem o navegador aberto.
- Refund real no sandbox e atendimento de `PAYMENT_REVIEW` sem dupla baixa/reembolso.

Consulte a documentação oficial atual do provedor ao implementar. As variáveis de exemplo são pontos de configuração, não uma promessa de compatibilidade com endpoints específicos.
