import { db, transaction } from "../src/lib/db";
import { defaultRoasts, defaultHomepage } from "../src/lib/defaults";
export async function seed() {
  await transaction(async (tx) => {
    for (const r of defaultRoasts)
      await tx.query(
        `INSERT INTO roast_profiles(id,name,subtitle,flavor,acidity,body,sweetness,bitterness,preparation,image_url,origin,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING`,
        [
          r.id,
          r.name,
          r.subtitle,
          r.flavor,
          r.acidity,
          r.body,
          r.sweetness,
          r.bitterness,
          r.preparation,
          r.imageUrl,
          r.origin,
          r.description,
        ],
      );
    await tx.query(
      "INSERT INTO homepage(featured_roast,month_label,headline) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
      [
        defaultHomepage.featuredRoast,
        defaultHomepage.monthLabel,
        defaultHomepage.headline,
      ],
    );
    for (const [i, r] of defaultRoasts.entries()) {
      const name = ["Amanhecer", "Ritual", "Depois do sol"][i];
      const result = await tx.query(
        `INSERT INTO products(item_index,slug,name,description,category,roast_id,image_url,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(item_index) DO NOTHING RETURNING id`,
        [
          `DEMO-00${i + 1}`,
          ["amanhecer", "ritual", "depois-do-sol"][i],
          name,
          `${r.flavor}. ${r.description}`,
          "Café em grãos",
          r.id,
          r.imageUrl,
          i,
        ],
      );
      if (result.rows[0])
        await tx.query(
          "INSERT INTO product_variants(product_id,sku,label,price_cents,stock) VALUES($1,$2,$3,$4,0),($1,$5,$6,$7,0)",
          [
            result.rows[0].id,
            `DEMO-${r.id}-250`,
            "250 g",
            [4900, 4900, 4500][i],
            `DEMO-${r.id}-500`,
            "500 g",
            [8900, 8900, 8200][i],
          ],
        );
    }
  });
}
if (process.argv[1]?.endsWith("/seed.ts")) {
  try {
    await seed();
    console.log(
      "Perfis e produtos de exemplo criados. Estoque inicial zero: revise o catálogo no painel antes de vender.",
    );
  } finally {
    await db.end();
  }
}
