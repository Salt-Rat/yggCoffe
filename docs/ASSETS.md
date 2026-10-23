# Imagens e direção visual

A paleta verde/creme/caramelo, identidade Grão na Porta e linguagem editorial foram adaptadas da landing local em `dist/index.html`. As fotos do hero e da seção de origem mantêm as URLs Unsplash já usadas no protótipo. Ilustrações de embalagens são HTML/CSS, não fotos de produtos reais. Substitua-as pelas fotos oficiais no painel.

O grão foi criado com a ferramenta integrada **imagegen**, com fundo transparente, e salvo em `public/images/coffee-bean.png`. A skill Sites foi usada para continuidade de layout/responsividade e procedimento de prévia; não houve publicação.

Prompt utilizado:

> Use case: product-mockup. Asset type: transparent web image for scroll animated coffee bean. Create one single photorealistic roasted arabica coffee bean, medium chestnut brown roast, upright vertical oval, deeply detailed natural porous wrinkled texture, central curved dark split clearly visible. Front view with slight three-dimensional volume, soft directional studio lighting from top left, fully isolated with actual transparent background, no cast background shadow. Bean occupies 80 percent of square frame, entire bean visible with generous clear margin. No text, no decoration, no other beans, no hands. This is an editorial macro photograph cutout for a premium coffee shop. Save resulting file for use in project.

Os três perfis iniciais usam esse recorte com tonalidades CSS clara, média e escura. Cada perfil tem `imageUrl` independente e pode usar seu próprio PNG/WebP transparente pelo painel, assim como a troca de imagens de planetas do Astrovale. A rotação é vinculada à posição de scroll, com requestAnimationFrame e listener passivo; respeita `prefers-reduced-motion`. É uma imagem animada com transformação CSS, não um modelo 3D volumétrico.

Dados dos perfis: transcritos da referência `/mnt/c/Users/aks/Pictures/comparaçãodetorras.PNG`; não são laudos específicos dos lotes demonstrativos. O admin deve atualizar descrições/origens com os dados reais da seleção.
