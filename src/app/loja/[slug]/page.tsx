import Link from "next/link";
import { notFound } from "next/navigation";
import { productBySlug } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
import type { Product } from "@/lib/defaults";
export const dynamic = "force-dynamic";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = (await productBySlug(slug)) as Product | null;
  if (!product) notFound();
  return (
    <div className="page-content">
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href="/loja">Nossos cafés</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <ProductDetail product={product} />
    </div>
  );
}
