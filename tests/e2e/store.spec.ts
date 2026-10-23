import { test, expect } from "@playwright/test";
test("captures an email action token once, including React strict mode", async ({
  page,
}) => {
  await page.goto(`/conta/verificar#token=${"A".repeat(43)}`);
  await expect(
    page.getByRole("button", { name: "Confirmar e-mail", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/conta\/verificar$/);
  await page
    .getByRole("button", { name: "Confirmar e-mail", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Link inválido",
  );
});
test("roast selector, comparison, scroll and responsive layout", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("motivo");
  const roast = page.locator("#torras");
  await roast.scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Torra clara", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Frutado e Floral");
  await page.getByRole("tab", { name: "Torra escura", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Intenso e Tostado");
  await page.getByRole("button", { name: "Comparar os três perfis" }).click();
  await expect(page.getByRole("table")).toContainText("Filtros manuais (V60)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("catalog filters, product details and empty basket", async ({ page }) => {
  await page.goto("/loja");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "bom dia",
  );
  await page.getByLabel("Filtrar por torra").selectOption("clara");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.locator(".product-card h3").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Amanhecer");
  await expect(
    page.getByRole("button", { name: "Temporariamente esgotado" }),
  ).toBeDisabled();
  await page.goto("/carrinho");
  await expect(
    page.getByText("Sua sacola ainda está vazia.", { exact: false }),
  ).toBeVisible();
});
test("customer cannot access admin panel; session survives reload and logout revokes it", async ({
  page,
}, testInfo) => {
  const email = `browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Seu nome").fill("Pessoa Navegador");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Senha · pelo menos 12 caracteres")
    .fill("Browser-test-password-123");
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Bom te ver",
  );
  const sessionCookie = (await page.context().cookies()).find((cookie) =>
    cookie.name.endsWith("coffee_session"),
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Strict");
  if (testInfo.config.metadata.dockerProduction) {
    expect(sessionCookie?.name).toBe("__Host-coffee_session");
    expect(sessionCookie?.secure).toBe(true);
  }
  const origin = new URL(page.url()).origin;
  const csrfAttack = await page.request.post("/api/graphql", {
    headers: { origin, "x-csrf-token": "public" },
    data: { query: 'mutation{updateProfile(name:"Invalid CSRF")}' },
  });
  expect(csrfAttack.status()).toBe(403);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Bom te ver",
  );
  await page.goto("/admin");
  await expect(page.getByText("Sua conta não tem permissão")).toBeVisible();
  await page.goto("/conta");
  await page.getByLabel("Nome", { exact: true }).fill("Perfil Atualizado");
  await page.getByRole("button", { name: "Atualizar nome" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Perfil");
  await page.getByRole("button", { name: "Adicionar endereço +" }).click();
  await page.getByLabel("Quem recebe").fill("Recebedor Teste");
  await page.getByLabel("CEP · somente números").fill("39100000");
  await page.getByLabel("Rua / avenida").fill("Rua de Integração");
  await page.getByLabel("Número", { exact: true }).fill("42");
  await page.getByLabel("Bairro", { exact: true }).fill("Centro");
  await page.getByLabel("Cidade", { exact: true }).fill("Diamantina");
  await page.getByRole("button", { name: "Salvar endereço" }).click();
  await expect(
    page.getByText("Rua de Integração, 42", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar endereço" }).click();
  await page.getByLabel("Cidade", { exact: true }).fill("Serro");
  await page.getByRole("button", { name: "Salvar endereço" }).click();
  await expect(page.getByText("Serro/MG", { exact: false })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remover endereço" }).click();
  await expect(
    page.getByRole("button", { name: "Editar endereço" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar na minha conta" }),
  ).toBeVisible();
  const replay = await page.request.post("/api/graphql", {
    headers: {
      origin,
      cookie: `${sessionCookie!.name}=${sessionCookie!.value}`,
    },
    data: { query: "{me{id}}" },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data.me).toBeNull();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page
    .getByLabel("Senha", { exact: true })
    .fill("Browser-test-password-123");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Perfil");
  await page.getByLabel("Confirme sua senha").fill("Browser-test-password-123");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Desativar minha conta" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar na minha conta" }),
  ).toBeVisible();
});
test("serves security headers and blocks unconfigured payment webhooks and unauthorized jobs", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect((await request.post("/api/jobs")).status()).toBe(401);
  expect(
    (
      await request.post("/api/webhooks/mercado-pago", {
        data: { status: "PAID" },
      })
    ).status(),
  ).toBe(503);
});
