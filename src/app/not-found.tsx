import Link from "next/link";
export default function NotFound() {
  return (
    <div className="section empty-state">
      <span className="eyebrow">404 · ESSE CAFÉ NÃO PASSOU POR AQUI</span>
      <h2>Vamos voltar ao começo?</h2>
      <p>A página que você procura não está disponível.</p>
      <Link className="button" href="/loja">
        Explorar os cafés
      </Link>
    </div>
  );
}
