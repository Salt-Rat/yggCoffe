# yggCoffe — plano de implementação da loja online

**Status:** planejamento técnico para implementação posterior pelo Codex  
**Data:** 21 de outubro de 2026  
**Estado encontrado:** a pasta contém somente `dist/index.html`; não há ainda aplicação, backend, banco ou suíte de testes.

## 1. Decisão recomendada

Para este projeto, a recomendação é:

```text
Next.js + React + TypeScript
GraphQL para operações da aplicação
PostgreSQL externo
Redis/cache e fila externos quando necessários
Vercel para frontend e funções Node.js
Provedor externo para pagamentos
Gerenciador de pacotes obrigatório: pnpm
```

### Regra obrigatória para TypeScript

Caso a aplicação seja implementada em TypeScript, o projeto deverá usar **pnpm como único gerenciador de pacotes**.

Não misturar `npm`, `yarn`, `bun` ou outros gerenciadores no mesmo projeto.

Regras:

- manter `packageManager` definido no `package.json`;
- versionar somente o `pnpm-lock.yaml`;
- instalar dependências com `pnpm install`;
- executar scripts com `pnpm <script>` ou `pnpm run <script>`;
- usar `pnpm add <pacote>` para dependências de produção;
- usar `pnpm add -D <pacote>` para dependências de desenvolvimento;
- configurar CI/CD e Vercel para instalar dependências com pnpm;
- não versionar `package-lock.json`, `yarn.lock` ou `bun.lock`;
- documentar no README que pnpm é requisito do projeto.

Comandos planejados:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

### Por que TypeScript + GraphQL neste caso

1. **Deploy mais simples na Vercel:** Next.js tem suporte de primeira classe e pode reunir storefront, páginas server-rendered, Route Handlers e funções no mesmo projeto.
2. **Um idioma no frontend e backend:** reduz a troca de contexto e permite compartilhar tipos, validações e contratos.
3. **Melhor integração com React:** o ecossistema de React/Next.js é o caminho mais direto para a experiência de loja.
4. **GraphQL tipado:** o catálogo, carrinho, conta e painel podem compartilhar um schema explícito.
5. **Menor risco operacional inicial:** a alternativa Python é viável, mas o runtime Python da Vercel ainda é documentado como Beta e exige mais atenção ao empacotamento e ao formato serverless.

Essa decisão não significa que TypeScript seja intrinsecamente mais seguro. A autorização, a validação, a proteção da sessão e os testes continuam sendo os controles principais.

## 2. Comparação das duas alternativas

| Critério | TypeScript + GraphQL + React + PostgreSQL | Python + GraphQL + React + PostgreSQL |
|---|---|---|
| Frontend React | Excelente | Excelente, normalmente com Next.js separado |
| Deploy do frontend na Vercel | Excelente | Excelente, usando Next.js |
| Deploy do backend na Vercel | Mais direto com Node.js/Next.js | Possível, mas o runtime Python está em Beta |
| Compartilhamento de tipos | Muito bom entre GraphQL, frontend e backend | Exige geração de tipos ou contratos separados |
| Maturidade para domínio de loja | Muito boa com Medusa ou backend próprio | Muito boa com Django/Saleor ou backend próprio |
| Simplicidade inicial | Maior | Média |
| Operação de workers e jobs | Exige serviço externo, assim como Python | Exige serviço externo, assim como TypeScript |
| Segurança possível | Alta | Alta |
| Recomendação para este projeto | **Primeira escolha** | Alternativa válida se a equipe dominar Python |

### Alternativa Python

Python seria uma boa escolha se o domínio de negócio, a equipe ou integrações existentes já estiverem concentrados em Python. Nesse cenário, a arquitetura recomendada seria:

```text
Next.js + React + TypeScript na Vercel
FastAPI/Django + GraphQL em serviço Python
PostgreSQL externo
```

A regra de uso de `pnpm` aplica-se ao frontend ou a qualquer parte TypeScript do projeto. O backend Python usará o gerenciador definido para Python, mas não deve introduzir um segundo gerenciador JavaScript no mesmo frontend.

Também é possível usar funções Python na Vercel, mas o backend deve ser desenhado como funções sem estado durável. Processos longos, workers, filas e tarefas periódicas devem ficar em serviços próprios. A documentação atual da Vercel confirma suporte a FastAPI, Django e Flask no runtime Python, porém classifica esse runtime como Beta. [Vercel — Python Runtime](https://vercel.com/docs/functions/runtimes/python)

## 3. Arquitetura alvo

```text
                           +----------------------+
                           |  Cliente web/mobile  |
                           +----------+-----------+
                                      |
                                      v
                    +-----------------+------------------+
                    | Next.js / React / TypeScript       |
                    | storefront, SSR, BFF, admin web    |
                    +-----------------+------------------+
                                      |
                         GraphQL HTTPS / REST webhooks
                                      |
                    +-----------------+------------------+
                    | API de comércio                  |
                    | auth, policies, domínio, GraphQL  |
                    +-----+-------------+---------------+
                          |             |
                          v             v
                  +---------------+  +------------------+
                  | PostgreSQL    |  | Redis/cache      |
                  | dados fonte   |  | rate limit/lock  |
                  +---------------+  +------------------+
                          |
                          v
                  +------------------+
                  | workers/fila     |
                  | e-mail, estoque, |
                  | pós-pagamento    |
                  +--------+---------+
                           |
          +----------------+------------------+
          v                v                  v
   Pagamentos          Frete/entrega       E-mail/SMS
```

### Componentes

- **Storefront:** catálogo, busca, produto, carrinho, checkout, conta e acompanhamento do pedido.
- **API:** GraphQL para operações do produto e endpoints HTTP específicos para webhooks, health check e tarefas internas.
- **PostgreSQL:** fonte de verdade para clientes, catálogo, preços, estoque, carrinhos, pedidos e pagamentos.
- **Redis:** somente dados temporários, locks, rate limiting, cache e filas; nunca deve ser a única fonte dos pedidos.
- **Object storage:** imagens de produtos, arquivos de nota fiscal e documentos, com URLs privadas ou assinadas quando necessário.
- **Workers:** tarefas assíncronas que não devem depender da resposta da requisição HTTP.
- **Admin:** área separada por permissão, com MFA obrigatório para contas administrativas.

A Vercel pode integrar PostgreSQL externo por meio do Marketplace; o produto antigo “Vercel Postgres” não deve ser assumido para novos projetos. [Vercel — Postgres](https://vercel.com/docs/postgres)

## 4. Módulos funcionais

### MVP obrigatório

1. Cadastro, login, recuperação de senha e verificação de e-mail.
2. Perfil, endereços e consentimentos.
3. Categorias, produtos, variantes, imagens e preços.
4. Busca, filtros e paginação.
5. Carrinho para usuário anônimo e usuário autenticado.
6. Checkout.
7. Pagamento por provedor externo.
8. Pedido, status, histórico e cancelamento permitido.
9. Estoque e reserva temporária.
10. Painel administrativo de catálogo e pedidos.
11. E-mails transacionais.
12. Logs de auditoria para ações administrativas.

### Pós-MVP

- cupons e regras promocionais;
- avaliações;
- lista de desejos;
- múltiplos depósitos;
- marketplace;
- assinaturas;
- programa de fidelidade;
- recomendações;
- multi-idioma e multi-moeda.

Esses itens não devem entrar na primeira versão sem uma necessidade concreta. Cada novo módulo aumenta a área de autorização, testes e manutenção.

## 5. Modelo de dados inicial

Entidades principais:

```text
User
 ├── UserRole
 ├── Address
 ├── Cart
 └── Order
        ├── OrderItem → ProductVariant → Product
        ├── Payment
        ├── Shipment
        └── OrderStatusHistory

Product
 ├── ProductVariant
 ├── ProductImage
 ├── Category
 └── Price

InventoryItem
 ├── available_quantity
 ├── reserved_quantity
 └── version
```

Regras importantes:

- valores monetários devem ser armazenados em centavos inteiros, nunca em `float`;
- o pedido deve guardar um snapshot do nome, SKU, preço e impostos no momento da compra;
- alterações posteriores no produto não podem modificar pedidos antigos;
- `Payment` deve armazenar somente identificadores, status e metadados mínimos do provedor;
- não armazenar número completo de cartão, CVV ou senha;
- o estoque deve usar transação e lock/controle de versão para evitar venda acima do disponível;
- o status do pedido deve possuir histórico imutável, não somente um campo sobrescrito.

## 5.1. Estrutura de classes e backend planejado

Esta seção descreve o esqueleto conceitual do backend. Neste momento são apenas classes, responsabilidades e contratos planejados; nenhum backend real deve ser criado nesta fase.

### Organização de pastas prevista

```text
backend/
├── domain/
│   ├── users/
│   │   ├── User.ts
│   │   ├── UserRole.ts
│   │   └── UserStatus.ts
│   ├── products/
│   │   ├── Product.ts
│   │   ├── ProductVariant.ts
│   │   └── InventoryItem.ts
│   ├── carts/
│   │   ├── Cart.ts
│   │   └── CartItem.ts
│   ├── orders/
│   │   ├── Order.ts
│   │   ├── OrderItem.ts
│   │   └── OrderStatus.ts
│   └── payments/
│       ├── Payment.ts
│       └── PaymentStatus.ts
│
├── application/
│   ├── AuthService.ts
│   ├── SessionService.ts
│   ├── UserService.ts
│   ├── ProductService.ts
│   ├── CartService.ts
│   ├── CheckoutService.ts
│   ├── OrderService.ts
│   ├── PaymentService.ts
│   ├── InventoryService.ts
│   └── AuditService.ts
│
├── authorization/
│   ├── AuthorizationService.ts
│   ├── OrderPolicy.ts
│   ├── ProductPolicy.ts
│   └── AdminPolicy.ts
│
├── repositories/
│   ├── UserRepository.ts
│   ├── SessionRepository.ts
│   ├── ProductRepository.ts
│   ├── CartRepository.ts
│   ├── OrderRepository.ts
│   └── PaymentRepository.ts
│
└── graphql/
    ├── schema.graphql
    ├── context.ts
    ├── queries/
    ├── mutations/
    └── resolvers/
```

### Entidades de domínio

#### `User`

Representa qualquer usuário do sistema:

```text
User
- id
- name
- email
- passwordHash
- role
- status
- createdAt
- updatedAt
```

#### `UserRole`

Administrador não deve ser uma classe `Admin` derivada de `User`. A autorização deve ser baseada em roles e policies:

```text
CUSTOMER
SUPPORT
ADMIN
```

Isso permite criar novas permissões sem duplicar a entidade de usuário.

#### `Product`

```text
Product
- id
- name
- slug
- description
- sku
- priceCents
- active
- createdAt
- updatedAt
```

Produtos com tamanho, cor ou outras combinações devem usar uma entidade separada:

```text
ProductVariant
- id
- productId
- sku
- attributes
- priceCents
- stock
```

#### `Cart`

```text
Cart
- id
- userId opcional para carrinho anônimo
- status
- items
- expiresAt
```

#### `Order`

```text
Order
- id
- userId
- status
- totalCents
- currency
- shippingAddressSnapshot
- billingAddressSnapshot
- items
- createdAt
```

#### `Payment`

```text
Payment
- id
- orderId
- provider
- providerPaymentId
- status
- amountCents
- paidAt
```

O pagamento deve guardar somente identificadores, status e metadados mínimos do provedor externo.

### Serviços de aplicação

Os resolvers GraphQL devem ser finos. Eles recebem a requisição, verificam o contexto e delegam a operação para um serviço.

| Classe | Responsabilidade |
|---|---|
| `AuthService` | Cadastro, login, logout, recuperação de senha e verificação de e-mail |
| `SessionService` | Criar, validar, renovar e revogar sessões |
| `UserService` | Perfil, endereços e preferências do cliente |
| `ProductService` | Criar, editar, ativar, desativar e consultar produtos |
| `CartService` | Adicionar, remover e atualizar itens do carrinho |
| `CheckoutService` | Recalcular preços, validar estoque e iniciar checkout |
| `OrderService` | Criar, consultar, cancelar e alterar pedidos |
| `PaymentService` | Criar pagamentos, validar webhooks e processar idempotência |
| `InventoryService` | Reservar, liberar e baixar estoque |
| `AuditService` | Registrar ações administrativas e eventos sensíveis |

### Repositórios

Os repositórios isolam o acesso ao PostgreSQL. A regra de autorização deve ser refletida nos métodos disponíveis:

```text
UserRepository
- findById(id)
- findByEmail(email)
- create(data)
- update(id, data)

ProductRepository
- findById(id)
- findBySlug(slug)
- listActive(filters)
- create(data)
- update(id, data)

OrderRepository
- findByIdForUser(orderId, userId)
- findManyByUser(userId, pagination)
- findByIdForAdmin(orderId)
- create(data)
- updateStatus(id, status)
```

O método `findOrderById(orderId)` não deve ser usado diretamente para cliente comum. O método deve exigir o contexto do usuário ou ser restrito ao fluxo administrativo.

## 5.2. Contrato GraphQL planejado

GraphQL será usado para catálogo, carrinho, conta e operações da loja. Webhooks de pagamento devem possuir endpoints HTTP específicos para facilitar validação da assinatura e leitura do corpo original.

### Tipos principais

```graphql
enum UserRole {
  CUSTOMER
  SUPPORT
  ADMIN
}

enum OrderStatus {
  PENDING
  PAID
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

type User {
  id: ID!
  name: String!
  email: String!
  role: UserRole!
}

type Product {
  id: ID!
  name: String!
  slug: String!
  description: String
  priceCents: Int!
  stock: Int!
  active: Boolean!
}

type OrderItem {
  id: ID!
  productName: String!
  sku: String!
  quantity: Int!
  unitPriceCents: Int!
}

type Order {
  id: ID!
  status: OrderStatus!
  totalCents: Int!
  items: [OrderItem!]!
  createdAt: String!
}
```

### Queries

```graphql
type Query {
  products(first: Int = 20, after: String): ProductConnection!
  productBySlug(slug: String!): Product
  me: User
  myOrders(first: Int = 20, after: String): OrderConnection!
  order(id: ID!): Order
}
```

`products` e `productBySlug` podem ser públicos. `me`, `myOrders` e `order` exigem autenticação. A query `order` deve verificar que o pedido pertence ao usuário atual, exceto quando o contexto for administrativo.

### Mutations

```graphql
type Mutation {
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!
  logout: Boolean!

  createProduct(input: CreateProductInput!): Product!
  updateProduct(id: ID!, input: UpdateProductInput!): Product!
  deactivateProduct(id: ID!): Product!

  addToCart(productId: ID!, quantity: Int!): Cart!
  removeFromCart(productId: ID!): Cart!
  createOrder(input: CreateOrderInput!): Order!
  cancelOrder(id: ID!): Order!
}
```

As mutations de produto exigem `ADMIN`. `cancelOrder` deve verificar o usuário proprietário, o status atual e as regras de negócio.

### Exemplos de operações

Consultar os próprios pedidos:

```graphql
query MyOrders {
  myOrders {
    edges {
      node {
        id
        status
        totalCents
        createdAt
        items {
          productName
          quantity
          unitPriceCents
        }
      }
    }
  }
}
```

Consultar um pedido específico:

```graphql
query MyOrder($id: ID!) {
  order(id: $id) {
    id
    status
    totalCents
    items {
      productName
      quantity
    }
  }
}
```

Mesmo que o cliente altere `$id`, a resposta deve ser negada se o pedido não pertencer ao usuário autenticado.

Criar produto como administrador:

```graphql
mutation CreateProduct($input: CreateProductInput!) {
  createProduct(input: $input) {
    id
    name
    slug
    priceCents
    stock
  }
}
```

O fluxo interno deve ser:

```text
GraphQL resolver
  → contexto de autenticação
  → AdminPolicy.requireCanManageProducts()
  → ProductService.createProduct()
  → ProductRepository.create()
```

### Contexto GraphQL

O contexto de cada requisição deve conter apenas informações confiáveis extraídas da sessão do servidor:

```text
GraphQLContext
- request
- currentUser opcional
- currentUserId opcional
- roles
- requestId
```

O frontend não pode enviar `role`, `userId` ou `currentUserId` para determinar permissões.

## 6. Autorização e segurança por usuário

O sistema deve separar claramente:

```text
autenticação = quem é o usuário?
autorização  = o que esse usuário pode fazer?
```

Fluxo obrigatório:

```text
cookie/sessão segura
        ↓
middleware de autenticação
        ↓
contexto confiável: currentUserId, roles
        ↓
policy de autorização
        ↓
serviço de domínio
        ↓
consulta já limitada ao proprietário
```

Exemplo de regra para consultar um pedido:

```ts
const order = await db.order.findFirst({
  where: {
    id: orderId,
    userId: context.currentUserId,
  },
});
```

Nunca confiar em `userId` enviado pelo frontend. O usuário deve ser obtido da sessão autenticada. A mesma política deve proteger leitura, edição, cancelamento, devolução, download de documentos, listagens, busca e exportações.

No GraphQL, cada resolver deve passar por uma policy ou serviço autorizado. Não basta proteger somente a página ou esconder um botão no React.

Políticas iniciais:

| Ação | Cliente | Suporte | Administrador |
|---|---:|---:|---:|
| Ver o próprio pedido | Sim | Sim | Sim |
| Ver pedido de outro cliente | Não | Conforme escopo | Sim |
| Cancelar pedido ainda não enviado | Sim, próprio | Conforme escopo | Sim |
| Alterar catálogo | Não | Não | Sim |
| Reembolsar pagamento | Não | Não por padrão | Sim, com MFA |
| Gerenciar usuários | Não | Não | Sim |

A política deve ser “deny by default”, com verificação no servidor em toda requisição. [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) e [OWASP — BOLA](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)

## 7. GraphQL: desenho seguro

Usar GraphQL para:

- consultar catálogo;
- consultar o carrinho atual;
- atualizar o carrinho;
- iniciar checkout;
- consultar os próprios pedidos;
- operações administrativas autorizadas.

Usar endpoints HTTP separados para:

- webhooks de pagamento;
- health check;
- callbacks de provedores;
- tarefas internas autenticadas.

Controles obrigatórios:

- schema explícito e versionado;
- validação de entrada no backend;
- paginação obrigatória em listas;
- limite de profundidade e custo de consultas;
- limite de tamanho de resposta;
- rate limiting por usuário, IP e operação;
- introspection restrita em produção quando aplicável;
- autorização dentro dos resolvers/serviços;
- não retornar campos sensíveis por padrão;
- logs sem senha, token, cartão ou dados pessoais desnecessários.

## 8. Pagamento, estoque e pedido

Fluxo recomendado:

```text
1. Cliente monta o carrinho.
2. Backend busca preço e estoque atuais.
3. Backend cria uma reserva temporária.
4. Backend cria a intenção de pagamento no provedor.
5. Cliente conclui o pagamento no provedor.
6. Provedor envia webhook assinado.
7. Backend valida assinatura e idempotência.
8. Backend confirma o pagamento.
9. Backend transforma a reserva em baixa definitiva.
10. Backend cria/atualiza o pedido e agenda notificações.
```

O redirect de retorno do navegador serve apenas para exibir o resultado ao cliente. Ele não deve ser a fonte de verdade para confirmar pagamento.

Casos que precisam de testes:

- webhook recebido duas vezes;
- webhook fora de ordem;
- pagamento aprovado depois de timeout;
- pagamento aprovado sem estoque suficiente;
- usuário fecha o navegador durante o pagamento;
- cancelamento simultâneo com confirmação;
- dois clientes comprando a última unidade;
- cupom expirado entre carrinho e checkout.

## 9. Estratégia de testes antes da implementação

### Estrutura prevista

```text
tests/
  unit/
    money.test.ts
    pricing.test.ts
    inventory.test.ts
    authorization.test.ts
    order-state-machine.test.ts
  integration/
    orders-owner-scope.test.ts
    cart-checkout.test.ts
    payment-webhook.test.ts
    inventory-concurrency.test.ts
    graphql-authz.test.ts
  e2e/
    registration-login.spec.ts
    catalog-cart.spec.ts
    checkout.spec.ts
    account-orders.spec.ts
    admin-permissions.spec.ts
  security/
    bola-idor.spec.ts
    csrf-session.spec.ts
    rate-limit.spec.ts
    graphql-query-limits.spec.ts
    input-validation.spec.ts
  fixtures/
    users.ts
    products.ts
    orders.ts
```

### Testes de autorização indispensáveis

```text
usuário A lê pedido A                 → 200
usuário A lê pedido B                 → 404 ou 403 sem vazamento de dados
usuário A altera pedido B             → negado
usuário A lista pedidos                → somente pedidos de A
usuário não autenticado lê pedido     → 401
cliente usa userId de outro usuário   → ignorado/negado
cliente altera role no request         → ignorado/negado
suporte acessa fora do escopo         → negado
administrador acessa pedido           → permitido conforme policy
```

### Testes de negócio

- soma de itens, desconto, frete e total;
- arredondamento monetário;
- preço alterado depois que o carrinho foi criado;
- produto sem estoque;
- reserva expirada;
- cancelamento permitido somente nos estados corretos;
- reembolso não duplicado;
- webhook idempotente;
- transição inválida de status rejeitada;
- pedido antigo preserva snapshot do produto.

### Testes de segurança

- SQL injection e filtros não parametrizados;
- XSS em nome de produto, descrição e endereço;
- CSRF em operações que usam cookie;
- brute force e rate limiting;
- sessão após logout;
- sessão expirada;
- escalada de cliente para administrador;
- BOLA/IDOR usando IDs de outros pedidos;
- upload de arquivo malicioso;
- consulta GraphQL profunda ou excessivamente grande;
- vazamento de secrets nos logs;
- acesso direto a arquivos privados.

Toda correção de bug de segurança deve incluir um teste que falhe antes da correção e passe depois dela.

## 10. Bugs previstos e prevenção

| Risco | Sintoma | Prevenção |
|---|---|---|
| Pedido de outro usuário exposto | troca do ID mostra dados alheios | filtro por `currentUserId` no repositório + teste BOLA |
| Preço manipulado | total enviado pelo navegador é aceito | recalcular no servidor |
| Estoque negativo | venda simultânea da última unidade | transação, lock ou versionamento |
| Pedido marcado como pago indevidamente | cliente altera redirect | confirmação por webhook assinado |
| Pagamento duplicado | webhook repetido cria dois pedidos | idempotency key e tabela de eventos |
| Sessão roubada | token acessível ao JavaScript | cookie HttpOnly/Secure/SameSite |
| Consulta GraphQL pesada | CPU e banco saturados | depth/cost limit, paginação e rate limit |
| Imagem maliciosa | arquivo executável servido | validação, storage separado e Content-Type seguro |
| Cache de dado privado | cliente vê resposta de outro cliente | não cachear respostas autenticadas sem chave por usuário |
| Migração destrutiva | perda de dados em deploy | migrações reversíveis, backup e staging |
| Worker duplicado | e-mail ou baixa executados duas vezes | jobs idempotentes e locks |
| Dependência vulnerável | falha em pacote indireto | lockfile, auditoria e atualização periódica |

## 11. Fases de implementação

### Fase 0 — fundação

- criar monorepo ou aplicação Next.js;
- configurar TypeScript estrito, lint, formatter e commits;
- configurar PostgreSQL local e ambiente de testes;
- definir variáveis de ambiente e secrets;
- configurar CI para lint, typecheck, testes e build;
- criar health check sem informações sensíveis.

### Fase 1 — identidade e autorização

- usuários, sessões, recuperação de senha e verificação de e-mail;
- roles e policies;
- testes de usuário próprio versus outro usuário;
- MFA para administradores;
- auditoria de login e ações administrativas.

### Fase 2 — catálogo

- produtos, variantes, categorias e imagens;
- busca e paginação;
- painel administrativo;
- testes de validação e visibilidade.

### Fase 3 — carrinho e estoque

- carrinho anônimo e autenticado;
- normalização do carrinho;
- cálculo server-side;
- reserva temporária;
- testes de concorrência.

### Fase 4 — checkout e pagamento

- integração com sandbox do provedor;
- criação de intenção de pagamento;
- webhook assinado;
- idempotência;
- estados do pedido;
- testes de falha e repetição.

### Fase 5 — operação

- painel de pedidos;
- e-mails transacionais;
- logs e auditoria;
- métricas;
- backups e restauração;
- revisão de segurança.

### Fase 6 — deploy

- ambiente local;
- Preview da Vercel;
- staging com banco separado;
- produção com domínio;
- smoke tests pós-deploy;
- plano de rollback.

## 12. Critérios de aceite do MVP

- um cliente consegue comprar um produto do início ao fim;
- nenhum cliente consegue consultar ou alterar pedido de outro cliente;
- preço e estoque são calculados no servidor;
- pagamento só é confirmado por webhook válido;
- webhooks repetidos não duplicam pedidos;
- pedidos antigos preservam seus preços e itens;
- administrador possui acesso separado e auditado;
- todos os testes obrigatórios passam no CI;
- não há secrets no repositório;
- migrations e backup foram testados;
- aplicação é deployável em Preview e Produção na Vercel.

## 13. Reuso de projeto existente

É recomendável estudar e, se a licença permitir, adaptar uma base open source madura em vez de copiar uma loja proprietária. As opções mais alinhadas a este plano são:

- **Medusa:** TypeScript/Node, PostgreSQL, módulos de comércio e starter Next.js. O núcleo é MIT, mas componentes Enterprise possuem termos próprios. [Repositório oficial](https://github.com/medusajs/medusa)
- **Saleor:** Python, GraphQL, arquitetura headless e storefront React/Next.js. Usar release estável, não o branch de desenvolvimento. [Repositório oficial](https://github.com/saleor/saleor)
- **Vendure:** TypeScript e GraphQL, mas com atenção à licença GPLv3. [Licenciamento oficial](https://vendure.io/licensing)

Não copiar código, dados, imagens, marca ou layout proprietário sem autorização. O estudo deve partir de código open source com licença compatível, documentação pública ou um sistema que seja de propriedade/autorização do projeto.

## 14. Próximo passo recomendado

Antes de escrever a aplicação completa, implementar uma fatia vertical mínima:

```text
login → catálogo → carrinho → pedido de teste → página “meus pedidos”
```

Essa fatia deve incluir desde o começo:

- PostgreSQL real;
- sessão real;
- policy de proprietário do pedido;
- GraphQL;
- teste de tentativa de acesso cruzado;
- CI;
- deploy de Preview.

Depois que essa fatia estiver comprovada, adicionar pagamento, estoque avançado e painel administrativo.

### Referências técnicas

- [Vercel — Frameworks](https://vercel.com/docs/frameworks)
- [Vercel — Next.js](https://vercel.com/frameworks/nextjs)
- [Vercel — Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel — PostgreSQL via Marketplace](https://vercel.com/docs/postgres)
- [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP — Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
