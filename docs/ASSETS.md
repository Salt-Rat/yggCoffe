# Imagens e direção visual

A paleta verde/creme/caramelo, identidade Grão na Porta e linguagem editorial foram adaptadas da landing local em `dist/index.html`. As fotos do hero e da seção de origem mantêm as URLs Unsplash já usadas no protótipo. Ilustrações de embalagens são HTML/CSS, não fotos de produtos reais. Substitua-as pelas fotos oficiais no painel.

O grão foi criado com a ferramenta integrada **imagegen**, com fundo transparente, e salvo em `public/images/coffee-bean.png`. A skill Sites foi usada para continuidade de layout/responsividade e procedimento de prévia; não houve publicação.

Prompt utilizado:

> Use case: product-mockup. Asset type: transparent web image for scroll animated coffee bean. Create one single photorealistic roasted arabica coffee bean, medium chestnut brown roast, upright vertical oval, deeply detailed natural porous wrinkled texture, central curved dark split clearly visible. Front view with slight three-dimensional volume, soft directional studio lighting from top left, fully isolated with actual transparent background, no cast background shadow. Bean occupies 80 percent of square frame, entire bean visible with generous clear margin. No text, no decoration, no other beans, no hands. This is an editorial macro photograph cutout for a premium coffee shop. Save resulting file for use in project.

O grão padrão é renderizado como um modelo 3D volumétrico em WebGL, com sulco modelado, verso abaulado e a frente fotográfica original projetada sobre a malha. A microtextura `public/images/coffee-skin-v5.webp` cobre laterais e verso, integrada gradualmente à frente. A referência `cafegrainback.PNG` orienta o verso mais liso, com poros finos e brilho suave. Cor, brilho, relevo e a largura da transição foram ajustados para aproximar frente e verso. As três torras compartilham geometria, textura, relevo e iluminação; somente as cores mudam suavemente. O recorte original também permanece como alternativa quando WebGL não está disponível. Na animação, clara, média e escura usam sempre esse mesmo modelo, independentemente do `imageUrl` de cada perfil.

A interação combina rolagem, arraste horizontal e teclado. O movimento automático para fora da tela, em abas ocultas e com `prefers-reduced-motion`; a rotação manual continua disponível. Detalhes do material e prompt de geração estão em [coffee-bean-3d.md](coffee-bean-3d.md).

Dados dos perfis: transcritos da referência `/mnt/c/Users/aks/Pictures/comparaçãodetorras.PNG`; não são laudos específicos dos lotes demonstrativos. O admin deve atualizar descrições/origens com os dados reais da seleção.
