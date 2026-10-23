# Coffee bean surface texture

Asset: `public/images/coffee-skin-v2.webp`

Generated with the built-in `image_gen` tool, using the supplied multi-angle coffee bean photograph as a shape/material reference and `public/images/coffee-bean.png` as a color reference. The generated material was resized to 1024 × 1024 and encoded as WebP at quality 88 for the website. The power-of-two dimensions support repeated WebGL texture sampling and mipmaps.

The front retains the original photograph. A separate seamless texture covers the sides and back through triplanar mapping on an asymmetric mesh with a domed back and a recessed front crease.

## Generation prompt

Use case: product-mockup. Asset type: square seamless diffuse/albedo material texture for a realistic 3D roasted coffee bean skin, covering the rounded back and sides. The first reference shows the real coffee bean from several angles: use its rounded back skin as the material reference ONLY. The second reference supplies the warm medium roast brown color. Generate ONE square image filled edge-to-edge with the small-scale surface material, photographed straight-on as a flat macro texture scan, NOT any whole bean. Medium to dark warm roasted chestnut brown, naturally irregular fine leathery pores, very fine shallow wrinkling, occasional thin short subtle hairline cracks, some tiny desaturated flecks. Fine natural organic random grain, never directional bands. Uniform diffuse illumination, neutral albedo, no specular reflections and no lighting gradient. The texture must tile seamlessly in both directions. Avoid a central groove or deep split, avoid any bean silhouette, checkerboard, background, writing, logos, watermark, coffee grounds, large fissures, repeating stripes, large scales or grid-like crack networks. Photoreal natural skin with restrained detailed microstructure; roughly 6mm square field of view, 1024 square.
