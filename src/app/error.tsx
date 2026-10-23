"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="section empty-state">
      <h2>Precisamos de uma pequena pausa.</h2>
      <p>
        Não foi possível carregar esta página. Tente novamente em instantes.
      </p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
