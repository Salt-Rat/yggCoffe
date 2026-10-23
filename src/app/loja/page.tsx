import Link from "next/link";
import { products } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/defaults";
export const dynamic = "force-dynamic";
export const metadata = { title: "Nossos cafés" };
export default async function Store({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const search =
      typeof query.busca === "string" ? query.busca.slice(0, 100) : "",
    roast =
      typeof query.torra === "string" &&
      ["clara", "media", "escura"].includes(query.torra)
        ? query.torra
        : "";
  const page = Math.min(10000, Math.max(1, Number(query.pagina) || 1));
  let selection: Product[] = [],
    failed = false;
  try {
    selection = await products({ search, roast, page, first: 12 });
  } catch {
    failed = true;
  }
  const url = (p: number) =>
    `/loja?${new URLSearchParams({ busca: search, torra: roast, pagina: String(p) })}`;
  return (
    <div className="page-content">
      <div className="page-heading">
        <span className="eyebrow">CADA XÍCARA, UMA DESCOBERTA</span>
        <h1>
          O seu próximo <em>bom dia.</em>
        </h1>
        <p>
          Escolha o perfil que combina com você. Do delicado ao intenso, há um
          café para cada momento.
        </p>
      </div>
      <form action="/loja" className="filters">
        <input
          type="search"
          name="busca"
          defaultValue={search}
          placeholder="Busque seu café ou índice…"
          aria-label="Buscar café"
        />
        <select
          name="torra"
          defaultValue={roast}
          aria-label="Filtrar por torra"
        >
          <option value="">Todas as torras</option>
          <option value="clara">Torra clara</option>
          <option value="media">Torra média</option>
          <option value="escura">Torra escura</option>
        </select>
        <button className="button small" type="submit">
          Filtrar
        </button>
        <span className="result-count">
          {selection.length} cafés nesta página
        </span>
      </form>
      {failed ? (
        <div className="error-message">
          Não foi possível carregar o catálogo. Tente novamente em instantes.
        </div>
      ) : selection.length ? (
        <div className="product-grid">
          {selection.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Nenhum café por aqui, ainda.</h2>
          <p>Tente outra busca ou explore todos os perfis.</p>
          <Link href="/loja" className="text-link">
            Limpar filtros
          </Link>
        </div>
      )}
      <nav className="pagination" aria-label="Paginação">
        {page > 1 && (
          <Link className="button secondary small" href={url(page - 1)}>
            Anterior
          </Link>
        )}
        <span>Página {page}</span>
        {selection.length === 12 && (
          <Link className="button secondary small" href={url(page + 1)}>
            Próxima
          </Link>
        )}
      </nav>
    </div>
  );
}
