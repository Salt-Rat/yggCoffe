# Grão de café 3D

A animação padrão usa uma malha assimétrica com sulco frontal e verso abaulado. A frente recupera a fotografia original `coffee-bean.png` já presente no Git, projetada sobre a malha e acompanhando sua rotação. Uma transição ampla pela curvatura dos ombros integra a frente à textura triplanar das laterais e do verso, mantendo a largura da mistura também perto das pontas. O sulco tem profundidade reduzida para preservar os detalhes da fenda fotografada. A iluminação é calculada durante a rotação, com luz principal, preenchimento e recorte. Clara, média e escura compartilham a mesma geometria, textura, relevo, rugosidade e iluminação. Somente a tonalidade muda entre as torras, sem recriar o renderizador ou escurecer a cena com filtros CSS.

## Material

- Frente: `public/images/coffee-bean.png`, com transparência e coordenadas de projeção baseadas na versão do Git. Seus reflexos originais são preservados; a iluminação adicional acompanha apenas a mudança de orientação.
- Laterais e verso: `public/images/coffee-skin-v5.webp`, 1024 × 1024, WebP qualidade 94.
- Gerada com a ferramenta integrada `image_gen`; redimensionada e codificada com Sharp.
- Mapeamento triplanar com mipmaps e normal map calculado uma vez a partir da textura, usando gradientes Sobel e vizinhança circular. O relevo acompanha os vincos fotografados, com microrelevo procedural discreto e derivadas opcionais para complementar a superfície.
- A cor castanha da textura é preservada em espaço linear. Frente, laterais e verso recebem a mesma tonalidade de torra; relevo moderado e brilho suave aproximam os materiais.
- As texturas v2 e v3 permanecem como artefatos anteriores; o renderizador combina o PNG frontal com v5; v4 também fica preservada.
- Se a frente não carregar, o material da malha continua funcionando. Se v5 não carregar, o material usa uma cor base com relevo procedural. Se WebGL falhar, aparece o PNG original.

## Histórico da textura v4

Referências: `coffee-skin-v3.webp` como alvo da edição e `coffee-bean.png` como referência da pele. Ferramenta integrada `image_gen`.

Prompt utilizado:

> Use case: precise-object-edit. Edit target: image 1, a square coffee skin material. Reference only: image 2, the photorealistic roasted coffee bean. Replace the sandy, fuzzy leatherlike material in image 1 with the actual distinctive smooth, tight, wrinkled roasted coffee skin seen on the outer lobes of image 2. Output ONE square seamless flat diffuse color texture covering the entire frame, edge-to-edge, no bean silhouette, no central cleft. This is a texture map for a 3D bean, not a photo of a bean. Preserve warm natural medium-roast chestnut brown. Surface should have clearly resolved irregular short shallow curved creases with gently rounded raised lips, small compact pores and tiny subtle roasting blisters; approximately 12-18 distinct short creases across the entire square, widely spaced, interrupted, unequal, not connected into polygons. Fine smooth skin BETWEEN wrinkles, NOT gravel, rough sand, bark, suede, coarse noise or flaky crumbs. Match the authentic roast skin anatomy and crisp macro detail of image 2, but remove its directional shadows and strong glossy highlights: illumination must be neutral and diffuse so the 3D renderer can light the surface. Subtle color variation only; do not make black speckles everywhere. Macro product-photography realism, very sharp fine detail. Seamless edges in both directions, no directional bands, no grid, no reptile scales, no giant fissures, no full bean, no text, no border. Opaque image.

## Textura v5 — verso baseado na referência

A referência `cafegrainback.PNG` enviada em 25/10/2026 mostra um grão com o verso voltado para a câmera, no alto à direita. A nova textura segue sua pele mais lisa, com poros finos, rugas discretas e poucas fissuras. O verso também recebe menos ondulação geométrica para produzir um reflexo mais contínuo. A frente original permanece preservada.

Arquivo: `public/images/coffee-skin-v5.webp`, 1024 × 1024, WebP qualidade 94. Criado com a ferramenta integrada `image_gen`; redimensionamento e conversão com Sharp. Entradas: v4 como alvo, a referência enviada como guia do verso e `coffee-bean.png` como guia de cor e detalhe.

Prompt utilizado:

> Use case: precise-object-edit. Asset type: seamless square diffuse/albedo texture for the back and sides of a rotating 3D roasted coffee bean. Image 1 is the edit target, an existing coffee material. Image 2 is the anatomy reference: match ONLY the smooth convex BACK of the TOP RIGHT floating bean, not the cleft beans below or left and not the blurred background. Image 3 is the existing front of our bean, a color and fine skin-detail reference that must remain visually compatible. Replace the large deep connected cracks and coarse crust in image 1 with the realistic tight, gently taut roasted skin of the reference back. Fine compact pores, small roasting dimples, extremely fine irregular short shallow wrinkles, broad smooth skin between the pores. Almost no visible large cracks. Preserve the rich medium chestnut roasted brown palette of image 3 so this material blends continuously with its sides. Output one flat uniformly lit square macro material scan, covering every pixel edge to edge, seamless/tileable on both axes. All detail must look photographic and organic, no procedural grid or repeated pattern. Neutral diffuse illumination with restrained local microcontrast, no baked directional highlight, no light gradient, no strong shadow, no bright white patches. No whole bean, no bean shape, no central groove, no split, no silhouette, no background, no text. Do not make coarse gravel, bark, crocodile skin, flaky crust, connected polygon cracks, dry soil, or sandpaper. A realistic gently oily smooth roasted coffee skin with very subtle fine wrinkles. Opaque square texture, 1024 by 1024.

## Interação e recursos

- Rolagem controla a rotação com interpolação; o cursor inclina o modelo discretamente.
- Arraste horizontal permite uma volta completa. Toque vertical continua rolando a página.
- Setas esquerda/direita giram o grão; Home retorna à frente.
- `prefers-reduced-motion` desativa flutuação, inclinação pelo cursor, transições e rotação pela rolagem. Controles manuais continuam disponíveis.
- O renderizador pausa fora da tela e quando a aba está oculta. A resolução é limitada a 1,75 vezes o tamanho CSS.
- Eventos de perda/restauração do contexto WebGL alternam entre a imagem original e o modelo reconstruído.
- Os três perfis de torra sempre usam o mesmo modelo 3D, mesmo que seus registros tenham URLs de imagem diferentes. O PNG original é a alternativa comum quando WebGL está indisponível; recebe a tonalidade CSS de cada torra.

Implementação: `src/components/coffee-bean.tsx` controla o ciclo de vida e a interação; `src/components/coffee-bean-surface.ts` contém geometria, material e iluminação.
