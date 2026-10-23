export const defaultRoasts = [
  {
    id: "clara",
    name: "Torra clara",
    subtitle: "Delicada. Viva. Surpreendente.",
    flavor: "Frutado e Floral",
    acidity: "Alta",
    body: "Leve",
    sweetness: "Sutil",
    bitterness: "Baixo",
    preparation: "Filtros manuais (V60)",
    imageUrl: "/images/coffee-bean.png",
    origin: "Seleção de origem brasileira",
    description:
      "Uma torra que convida a perceber os detalhes: aromas florais, acidez viva e uma xícara delicada.",
  },
  {
    id: "media",
    name: "Torra média",
    subtitle: "O equilíbrio de um bom dia.",
    flavor: "Doce e Equilibrado",
    acidity: "Média",
    body: "Médio",
    sweetness: "Alta",
    bitterness: "Médio",
    preparation: "Versátil (qualquer método)",
    imageUrl: "/images/coffee-bean.png",
    origin: "Seleção de origem brasileira",
    description:
      "Doçura e corpo em harmonia. Um perfil acolhedor para fazer parte do seu ritual, do primeiro ao último gole.",
  },
  {
    id: "escura",
    name: "Torra escura",
    subtitle: "Presença em cada gole.",
    flavor: "Intenso e Tostado",
    acidity: "Baixa",
    body: "Encorpado",
    sweetness: "Baixa",
    bitterness: "Alto",
    preparation: "Espresso e Prensa Francesa",
    imageUrl: "/images/coffee-bean.png",
    origin: "Seleção de origem brasileira",
    description:
      "Uma xícara intensa e encorpada, com notas tostadas e um final prolongado para quem aprecia personalidade.",
  },
];
export type Roast = (typeof defaultRoasts)[number];
export type Homepage = {
  featuredRoast: string;
  monthLabel: string;
  headline: string;
};
export const defaultHomepage: Homepage = {
  featuredRoast: "media",
  monthLabel: "Seleção do mês",
  headline: "Um pequeno grão. Um mundo de possibilidades.",
};
export type Variant = {
  id: string;
  sku: string;
  label: string;
  priceCents: number;
  stock: number;
  reserved: number;
  available: number;
  active: boolean;
};
export type Product = {
  id: string;
  itemIndex: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  roastId: string;
  imageUrl: string;
  active: boolean;
  displayOrder: number;
  variants: Variant[];
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
