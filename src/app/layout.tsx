import type { Metadata } from "next";
import { ShopProvider } from "@/components/shop-provider";
import { Header, Footer } from "@/components/shell";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "Grão na Porta — seu ritual, entregue",
    template: "%s · Grão na Porta",
  },
  description:
    "Encontre sua torra: clara, média ou escura. Cafés de origem para transformar o seu dia em uma boa pausa.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <ShopProvider>
          <a className="skip-link" href="#conteudo">
            Pular para o conteúdo
          </a>
          <Header />
          <main id="conteudo">{children}</main>
          <Footer />
        </ShopProvider>
      </body>
    </html>
  );
}
