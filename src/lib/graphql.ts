import {
  buildSchema,
  execute,
  parse,
  validate,
  specifiedRules,
  NoSchemaIntrospectionCustomRule,
  GraphQLScalarType,
  GraphQLError,
  type DocumentNode,
  type SelectionSetNode,
  type FragmentDefinitionNode,
} from "graphql";
import { z } from "zod";
import * as auth from "./auth";
import * as catalog from "./catalog";
import * as orders from "./orders";
import { AppError, insist } from "./errors";
import { checkOrigin, ipKey, rateLimit, readBody } from "./security";
import {
  paymentAvailability,
  shippingCents,
  type PaymentProvider,
} from "./payments";
export const schema = buildSchema(`
 scalar DateTime
 type User { id: ID!, name: String!, email: String!, role: String!, emailVerified: Boolean! }
 type Variant { id:ID!, sku:String!, label:String!, priceCents:Int!, stock:Int!, reserved:Int!, available:Int!, active:Boolean! }
 type Product { id:ID!, itemIndex:String!, slug:String!, name:String!, description:String!, category:String!, roastId:String!, imageUrl:String!, active:Boolean!, displayOrder:Int!, variants:[Variant!]! }
 type Roast { id:ID!, name:String!, subtitle:String!, flavor:String!, acidity:String!, body:String!, sweetness:String!, bitterness:String!, preparation:String!, imageUrl:String!, origin:String!, description:String! }
 type Homepage { featuredRoast:String!, monthLabel:String!, headline:String! }
 type CartItem { variantId:ID!, quantity:Int!, name:String!, slug:String!, imageUrl:String!, roastId:String!, label:String!, priceCents:Int!, available:Int!, active:Boolean! }
 type Address { id:ID!, recipient:String!, postalCode:String!, street:String!, number:String!, complement:String!, district:String!, city:String!, state:String! }
 type OrderItem { productName:String!, sku:String!, quantity:Int!, unitPriceCents:Int! }
 type OrderHistory { status:String!, note:String!, createdAt:DateTime! }
 type ShippingAddress { recipient:String!, postalCode:String!, street:String!, number:String!, complement:String!, district:String!, city:String!, state:String! }
 type Order { id:ID!, status:String!, totalCents:Int!, subtotalCents:Int!, shippingCents:Int!, createdAt:DateTime!, expiresAt:DateTime!, checkoutUrl:String, trackingCode:String, items:[OrderItem!], history:[OrderHistory!], customerName:String, customerEmail:String, shippingAddress:ShippingAddress }
 type Audit { id:ID!, action:String!, targetId:String, createdAt:DateTime! }
 input RegisterInput { name:String!, email:String!, password:String!, consent:Boolean! }
 input LoginInput { email:String!, password:String!, code:String }
 input ReauthInput { password:String!, code:String! }
 input VariantInput { id:ID, sku:String!, label:String!, priceCents:Int!, stock:Int!, active:Boolean! }
 input ProductInput { id:ID, itemIndex:String!, slug:String!, name:String!, description:String!, category:String!, roastId:String!, imageUrl:String!, active:Boolean!, displayOrder:Int!, variants:[VariantInput!]! }
 input RoastInput { id:ID!, name:String!, subtitle:String!, flavor:String!, acidity:String!, body:String!, sweetness:String!, bitterness:String!, preparation:String!, imageUrl:String!, origin:String!, description:String! }
 input HomepageInput { featuredRoast:String!, monthLabel:String!, headline:String! }
 input AddressInput { id:ID, recipient:String!, postalCode:String!, street:String!, number:String!, complement:String!, district:String!, city:String!, state:String! }
 input CheckoutItem { variantId:ID!, quantity:Int! }
 input CheckoutInput { key:ID!, addressId:ID!, items:[CheckoutItem!]! }
 type Query {
   me:User, products(search:String,roast:String,category:String,page:Int,first:Int):[Product!]!, productBySlug(slug:String!):Product,
   roasts:[Roast!]!, homepage:Homepage!, cart:[CartItem!]!, addresses:[Address!]!, myOrders(page:Int):[Order!]!, order(id:ID!):Order,
   adminProducts(page:Int):[Product!]!, adminOrders(page:Int):[Order!]!, adminOrder(id:ID!):Order!, auditLog(page:Int):[Audit!]!, paymentsEnabled:Boolean!, shippingCents:Int
 }
 type Mutation {
   register(input:RegisterInput!):Boolean!, login(input:LoginInput!):Boolean!, logout:Boolean!, reauthenticate(input:ReauthInput!):Boolean!,
   requestPasswordReset(email:String!):Boolean!, resetPassword(token:String!,password:String!):Boolean!, verifyEmail(token:String!):Boolean!, resendVerification:Boolean!, updateProfile(name:String!):Boolean!,
   saveProduct(input:ProductInput!):ID!, saveRoast(input:RoastInput!):Boolean!, saveHomepage(input:HomepageInput!):Boolean!,
   setCartItem(variantId:ID!,quantity:Int!):[CartItem!]!, saveAddress(input:AddressInput!):ID!, createOrder(input:CheckoutInput!):Order!, cancelOrder(id:ID!):Boolean!,
   updateOrderStatus(id:ID!,status:String!,trackingCode:String):Boolean!, deleteAddress(id:ID!):Boolean!, deactivateAccount(password:String!):Boolean!, archiveProduct(id:ID!):Boolean!
 }
`);
(schema.getType("DateTime") as GraphQLScalarType).serialize = (value) =>
  value instanceof Date ? value.toISOString() : String(value);
type Args = Record<string, unknown>;
function resolvers(ctx: auth.Context, payments?: PaymentProvider) {
  return {
    me: () => ctx.session?.user || null,
    products: (args: Args) => catalog.products(args),
    productBySlug: ({ slug }: { slug: string }) => catalog.productBySlug(slug),
    roasts: catalog.roasts,
    homepage: catalog.homepage,
    cart: () => catalog.cart(ctx),
    addresses: () => catalog.addresses(ctx),
    myOrders: ({ page }: { page?: number }) => orders.listOrders(ctx, page),
    order: ({ id }: { id: string }) => orders.getOrder(ctx, id),
    adminProducts: ({ page }: { page?: number }) => {
      auth.requireAdmin(ctx);
      return catalog.products({ page, first: 30 }, true);
    },
    adminOrders: ({ page }: { page?: number }) =>
      orders.listOrders(ctx, page, true),
    adminOrder: ({ id }: { id: string }) => orders.getAdminOrder(ctx, id),
    auditLog: ({ page }: { page?: number }) => catalog.auditLog(ctx, page),
    paymentsEnabled: () => !!payments || paymentAvailability(),
    shippingCents: () => {
      try {
        return shippingCents();
      } catch {
        return null;
      }
    },
    register: ({ input }: Args) => auth.register(ctx, input),
    login: ({ input }: Args) => auth.login(ctx, input),
    logout: () => auth.logout(ctx),
    reauthenticate: ({ input }: Args) => auth.reauthenticate(ctx, input),
    requestPasswordReset: ({ email }: { email: string }) =>
      auth.requestReset(ctx, email),
    resetPassword: ({ token, password }: { token: string; password: string }) =>
      auth.redeemToken(token, "RESET", password),
    verifyEmail: ({ token }: { token: string }) =>
      auth.redeemToken(token, "VERIFY"),
    resendVerification: () => auth.resendVerification(ctx),
    updateProfile: ({ name }: { name: string }) =>
      catalog.updateProfile(ctx, name),
    saveProduct: ({ input }: Args) => catalog.saveProduct(ctx, input),
    saveRoast: ({ input }: Args) => catalog.saveRoast(ctx, input),
    saveHomepage: ({ input }: Args) => catalog.saveHomepage(ctx, input),
    saveAddress: ({ input }: Args) => catalog.saveAddress(ctx, input),
    deleteAddress: ({ id }: { id: string }) => catalog.deleteAddress(ctx, id),
    archiveProduct: ({ id }: { id: string }) => catalog.archiveProduct(ctx, id),
    deactivateAccount: ({ password }: { password: string }) =>
      auth.deactivateAccount(ctx, password),
    setCartItem: ({
      variantId,
      quantity,
    }: {
      variantId: string;
      quantity: number;
    }) => catalog.setCartItem(ctx, variantId, quantity),
    createOrder: ({ input }: Args) => orders.createOrder(ctx, input, payments),
    cancelOrder: ({ id }: { id: string }) => orders.cancelOrder(ctx, id),
    updateOrderStatus: ({
      id,
      status,
      trackingCode,
    }: {
      id: string;
      status: string;
      trackingCode?: string;
    }) => orders.updateOrderStatus(ctx, id, status, trackingCode),
  };
}
export function enforceQueryLimits(document: DocumentNode) {
  const operations = document.definitions.filter(
    (d) => d.kind === "OperationDefinition",
  );
  insist(
    operations.length === 1,
    "QUERY_LIMIT",
    "Envie uma operação por requisição.",
  );
  const operation = operations[0];
  insist(
    operation.operation !== "subscription",
    "QUERY_LIMIT",
    "Subscriptions não disponíveis.",
  );
  const fragments = new Map(
    document.definitions
      .filter(
        (d): d is FragmentDefinitionNode => d.kind === "FragmentDefinition",
      )
      .map((d) => [d.name.value, d]),
  );
  let fields = 0,
    rootFields = 0,
    visited = 0;
  function walk(
    selection: SelectionSetNode,
    depth: number,
    path: Set<string>,
    hops = 0,
  ) {
    insist(depth <= 7, "QUERY_LIMIT", "Consulta muito profunda.");
    insist(hops <= 24, "QUERY_LIMIT", "Muitos níveis de fragmentos.");
    for (const node of selection.selections) {
      insist(++visited <= 500, "QUERY_LIMIT", "Consulta muito complexa.");
      if (node.kind === "Field") {
        fields++;
        if (depth === 1) rootFields++;
        insist(fields <= 180, "QUERY_LIMIT", "Consulta muito complexa.");
        if (node.selectionSet)
          walk(node.selectionSet, depth + 1, path, hops + 1);
      } else if (node.kind === "InlineFragment")
        walk(node.selectionSet, depth, path, hops + 1);
      else {
        const name = node.name.value;
        insist(!path.has(name), "QUERY_LIMIT", "Fragmento recursivo.");
        const f = fragments.get(name);
        if (f) walk(f.selectionSet, depth, new Set([...path, name]), hops + 1);
      }
    }
  }
  walk(operation.selectionSet, 1, new Set());
  insist(
    rootFields <= (operation.operation === "mutation" ? 1 : 8),
    "QUERY_LIMIT",
    "Número de operações excedido.",
  );
  return operation;
}
export function safeError(error: unknown) {
  if (error instanceof GraphQLError)
    return {
      message: "Consulta GraphQL inválida.",
      extensions: { code: "GRAPHQL_INVALID" },
      status: 400,
    };
  if (error instanceof AppError)
    return {
      message: error.message,
      extensions: { code: error.code },
      status: error.status,
    };
  if (error instanceof z.ZodError)
    return {
      message: error.issues[0]?.message || "Dados inválidos.",
      extensions: { code: "VALIDATION" },
      status: 400,
    };
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "23505"
  )
    return {
      message: "Índice, slug ou SKU já cadastrado.",
      extensions: { code: "CONFLICT" },
      status: 409,
    };
  if (error instanceof SyntaxError)
    return {
      message: "JSON inválido.",
      extensions: { code: "BAD_REQUEST" },
      status: 400,
    };
  return {
    message: "Não foi possível concluir agora. Tente novamente.",
    extensions: { code: "INTERNAL" },
    status: 500,
  };
}
// Dependencies are supplied only by server code, never by request fields or environment flags.
export async function graphqlRequest(
  request: Request,
  dependencies: { payments?: PaymentProvider } = {},
) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  try {
    checkOrigin(request);
    const ip = ipKey(request);
    await rateLimit(`global:${ip}`, 180, 60);
    const body = z
      .object({
        query: z.string().min(1).max(16000),
        variables: z.record(z.string(), z.unknown()).optional(),
        operationName: z.string().max(80).optional(),
      })
      .strict()
      .parse(JSON.parse(await readBody(request)));
    const document = parse(body.query, { maxTokens: 2500 });
    const operation = enforceQueryLimits(document);
    const validation = validate(
      schema,
      document,
      process.env.NODE_ENV === "production"
        ? [...specifiedRules, NoSchemaIntrospectionCustomRule]
        : specifiedRules,
    );
    insist(!validation.length, "GRAPHQL_INVALID", "Consulta inválida.");
    const session = await auth.getSession(request);
    const ctx: auth.Context = {
      request,
      headers,
      session,
      cartKey: await auth.cartOwner(request, headers, session),
      ip,
    };
    await rateLimit(`actor:${session?.user.id || ip}`, 120, 60);
    if (operation.operation === "mutation") {
      auth.checkCsrf(ctx);
      await rateLimit(`mutation:${session?.user.id || ip}`, 40, 60);
    }
    const result = await execute({
      schema,
      document,
      rootValue: resolvers(ctx, dependencies.payments),
      variableValues: body.variables,
      operationName: body.operationName,
    });
    const errors = result.errors?.map((error) =>
      safeError(
        error.originalError ||
          new AppError("GRAPHQL_INVALID", "Dados da consulta inválidos."),
      ),
    );
    const payload = JSON.stringify({
      data: result.data,
      ...(errors
        ? {
            errors: errors.map(({ message, extensions }) => ({
              message,
              extensions,
            })),
          }
        : {}),
    });
    insist(
      Buffer.byteLength(payload) <= 262144,
      "RESPONSE_LIMIT",
      "Reduza o tamanho da consulta.",
    );
    if (errors?.some((error) => error.status === 429))
      headers.set("retry-after", "60");
    return new Response(payload, {
      status: errors?.[0]?.status || 200,
      headers,
    });
  } catch (error) {
    const { status, ...safe } = safeError(error);
    if (status === 429) headers.set("retry-after", "60");
    return Response.json({ errors: [safe] }, { status, headers });
  }
}
