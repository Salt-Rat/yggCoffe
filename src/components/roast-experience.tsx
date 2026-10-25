"use client";
import { useState } from "react";
import { ArrowDown, ArrowUpRight, MoveDown } from "lucide-react";
import Link from "next/link";
import type { Roast, Homepage } from "@/lib/defaults";
import { CoffeeBean } from "@/components/coffee-bean";
export function RoastExperience({
  profiles,
  settings,
}: {
  profiles: Roast[];
  settings: Homepage;
}) {
  const [selected, setSelected] = useState(settings.featuredRoast),
    [comparison, setComparison] = useState(false);
  const current = profiles.find((r) => r.id === selected) || profiles[0];
  return (
    <section className="roast-section" id="torras">
      <div className="section roast-inner">
        <div className="roast-heading">
          <span className="eyebrow">POR DENTRO DO SEU CAFÉ</span>
          <h2>{settings.headline}</h2>
          <p>A mesma paixão. Três jeitos de sentir. Descubra o seu.</p>
        </div>
        <div
          className="roast-tabs"
          role="tablist"
          aria-label="Escolher perfil de torra"
        >
          {profiles.map((r) => (
            <button
              key={r.id}
              id={`tab-${r.id}`}
              type="button"
              role="tab"
              aria-selected={selected === r.id}
              aria-controls="roast-panel"
              onClick={() => setSelected(r.id)}
            >
              <span className={`roast-dot ${r.id}`} />
              {r.name}
              {r.id === settings.featuredRoast && <small>DO MÊS</small>}
            </button>
          ))}
        </div>
        <div
          className={`roast-stage roast-${current.id}`}
          id="roast-panel"
          role="tabpanel"
          aria-labelledby={`tab-${current.id}`}
        >
          <div className="roast-story">
            <span className="vertical-kicker">{settings.monthLabel}</span>
            <span className="tiny-label">{current.origin}</span>
            <h3>{current.subtitle}</h3>
            <p>{current.description}</p>
            <Link className="text-link" href={`/loja?torra=${current.id}`}>
              Provar essa torra <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="bean-stage">
            <div className="bean-orbit" />
            <span className="bean-cross cross-top">+</span>
            <span className="bean-cross cross-bottom">+</span>
            <CoffeeBean
              imageUrl={current.imageUrl}
              name={current.name}
              roast={current.id}
            />
            <span className="bean-caption">
              <MoveDown size={14} /> ROLE OU ARRASTE PARA EXPLORAR
            </span>
          </div>
          <div className="roast-facts" aria-live="polite">
            <div className="facts-heading">
              <span>PERFIL NA XÍCARA</span>
              <span>0{profiles.indexOf(current) + 1} / 03</span>
            </div>
            {[
              ["Sabor principal", current.flavor],
              ["Acidez", current.acidity],
              ["Corpo", current.body],
              ["Doçura", current.sweetness],
              ["Amargor", current.bitterness],
              ["Melhor preparo", current.preparation],
            ].map(([label, value]) => (
              <div className="fact" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="compare-toggle">
          <button
            className="text-link"
            aria-expanded={comparison}
            onClick={() => setComparison(!comparison)}
          >
            {comparison ? "Fechar comparação" : "Comparar os três perfis"}
            <ArrowDown size={16} className={comparison ? "rotated" : ""} />
          </button>
        </div>
        {comparison && (
          <div className="table-wrap">
            <table className="comparison">
              <caption>Comparação dos perfis de torra</caption>
              <thead>
                <tr>
                  <th scope="col">Característica</th>
                  {profiles.map((r) => (
                    <th scope="col" key={r.id}>
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    "flavor",
                    "acidity",
                    "body",
                    "sweetness",
                    "bitterness",
                    "preparation",
                  ] as const
                ).map((key, index) => (
                  <tr key={key}>
                    <th scope="row">
                      {
                        [
                          "Sabor principal",
                          "Acidez",
                          "Corpo",
                          "Doçura",
                          "Amargor",
                          "Melhor preparo",
                        ][index]
                      }
                    </th>
                    {profiles.map((r) => (
                      <td key={r.id}>{r[key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
