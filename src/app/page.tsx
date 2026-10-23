import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Leaf,
  Package,
  SlidersHorizontal,
} from "lucide-react";
import { products, roasts, homepage } from "@/lib/catalog";
import { defaultHomepage, defaultRoasts, type Product } from "@/lib/defaults";
import { RoastExperience } from "@/components/roast-experience";
import { ProductCard } from "@/components/product-card";
export const dynamic = "force-dynamic";
export default async function Home() {
  let profiles = defaultRoasts,
    settings = defaultHomepage,
    selection: Product[] = [];
  try {
    [profiles, settings, selection] = await Promise.all([
      roasts(),
      homepage(),
      products({ first: 3 }),
    ]);
  } catch {
    /* Public editorial content remains accessible during database outages. */
  }
  return (
    <>
      <section className="hero section">
        <div className="hero-copy">
          <span className="eyebrow">SEU RITUAL COMEÇA AQUI</span>
          <h1>
            Todo mês, um novo <em>motivo</em> para acordar.
          </h1>
          <p>
            Cafés de origem, novos sabores e aquele tempo só seu. Encontre a
            torra que combina com sua manhã. A gente leva até a sua porta.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/loja">
              Encontrar meu café <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" href="#torras">
              Descobrir as torras <ArrowRight size={17} />
            </Link>
          </div>
          <span className="hero-note">
            <span /> Da escolha do grão ao seu primeiro gole.
          </span>
        </div>
        <div className="hero-visual">
          <div
            className="hero-photo"
            role="img"
            aria-label="Café servido em uma mesa com luz natural"
          />
          <div className="hero-stamp">
            feito para
            <br />
            <em>suas manhãs</em>
            <span>✳</span>
          </div>
          <div className="floating-card">
            <span className="tiny-label">
              {settings.monthLabel}
              <span className="status-dot" />
            </span>
            <strong>
              {profiles.find((r) => r.id === settings.featuredRoast)?.name}
            </strong>
            <p>
              {profiles.find((r) => r.id === settings.featuredRoast)?.subtitle}
            </p>
            <Link href="#torras" aria-label="Conhecer a torra do mês">
              <ArrowUpRight size={24} />
            </Link>
          </div>
        </div>
      </section>
      <div className="marquee" aria-hidden="true">
        <span>
          torra fresca <b>✳</b> pausa boa <b>✳</b> origens que surpreendem{" "}
          <b>✳</b> seu ritual <b>✳</b> torra fresca <b>✳</b> pausa boa <b>✳</b>{" "}
          origens que surpreendem
        </span>
      </div>
      <section className="section how-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DO NOSSO CUIDADO À SUA XÍCARA</span>
            <h2>
              Uma pausa boa em
              <br />
              <em>três movimentos.</em>
            </h2>
          </div>
          <p>
            Não precisa complicar. Um café que combina com você, preparado do
            seu jeito.
          </p>
        </div>
        <div className="steps">
          {[
            {
              icon: <SlidersHorizontal />,
              title: "Encontre seu perfil",
              text: "Clara, média ou escura. Explore os sabores e escolha a torra que faz o seu dia.",
            },
            {
              icon: <Leaf />,
              title: "Escolha seu café",
              text: "Conheça os grãos disponíveis, selecione o tamanho e monte a sua sacola.",
            },
            {
              icon: <Package />,
              title: "Receba. Prepare. Aprecie.",
              text: "Acompanhe seu pedido e reserve um momento para o que realmente importa.",
            },
          ].map((s, i) => (
            <article className="step" key={s.title}>
              <div>
                <span>0{i + 1}</span>
                {s.icon}
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>
      <RoastExperience profiles={profiles} settings={settings} />
      <section className="section selection-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A PRÓXIMA PAUSA TEM ENDEREÇO</span>
            <h2>
              Escolhidos para o<br />
              <em>seu dia a dia.</em>
            </h2>
          </div>
          <Link href="/loja" className="text-link">
            Ver todos os cafés <ArrowUpRight size={18} />
          </Link>
        </div>
        {selection.length ? (
          <div className="product-grid">
            {selection.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Estamos preparando a próxima seleção.</p>
            <Link href="/loja" className="button secondary">
              Visitar a loja
            </Link>
          </div>
        )}
      </section>
      <section className="origin-section" id="origem">
        <div className="section origin-grid">
          <div
            className="origin-photo"
            role="img"
            aria-label="Grãos de café torrado"
          />
          <div>
            <span className="eyebrow">POR TRÁS DE CADA GRÃO</span>
            <h2>
              De quem cultiva
              <br />
              para quem <em>aprecia.</em>
            </h2>
            <p>
              Acreditamos que um bom café também é um convite: a desacelerar,
              descobrir um sabor diferente e tornar especial o que acontece
              todos os dias.
            </p>
            <div className="origin-note">
              <Leaf size={28} />
              <p>
                O perfil muda. O cuidado permanece.
                <br />
                <strong>Escolha com tempo. Aprecie com vontade.</strong>
              </p>
            </div>
            <Link href="/loja" className="button">
              Conheça a seleção <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="quote-section section">
        <span className="eyebrow">O QUE QUEREMOS ENTREGAR</span>
        <blockquote>
          “Que abrir a porta e encontrar seu café seja o primeiro momento bom do
          dia.”
        </blockquote>
        <span>— Grão na Porta, desde o primeiro gole</span>
      </section>
      <section className="section faq-section">
        <div>
          <span className="eyebrow">PODE CHEGAR MAIS</span>
          <h2>
            Perguntas que
            <br />
            <em>fazem sentido.</em>
          </h2>
        </div>
        <div>
          {[
            [
              "Qual torra combina comigo?",
              "A clara destaca notas frutadas e florais; a média equilibra doçura e corpo; a escura tem sabor intenso e tostado. Compare os perfis acima para encontrar o seu.",
            ],
            [
              "Posso comprar sem assinatura?",
              "Sim. Escolha os cafés e quantidades que preferir. Os pedidos desta loja são compras avulsas.",
            ],
            [
              "Como acompanho meu pedido?",
              "Entre na sua conta para consultar o histórico, o status e o código de rastreio quando o pedido for enviado.",
            ],
            [
              "Posso cancelar um pedido?",
              "Pedidos aguardando pagamento podem ser cancelados na sua conta. Depois da confirmação, a solicitação precisa ser analisada pela equipe da loja.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
