# Créditos y licencias

## Modelos, texturas y HDRI — Poly Haven (CC0)
Todos descargados de https://polyhaven.com (dominio público, CC0). Se guardan en `public/assets/`.

Modelos: dining_table, dining_chair_02, tea_set_01, vintage_electric_kettle, croissant, carved_wooden_plate,
wooden_bowl_01, food_apple_01, lemon, bananas, food_pears_asian_01, street_rat, mousetrap, wall_clock,
potted_plant_02, potted_plant_04, painted_wooden_cabinet, electric_stove, caged_hanging_light, wine_bottles_01,
jug_01, book_encyclopedia_set_01, round_spectacles, wooden_cutting_board, yellow_onion, wicker_basket_01,
painted_wooden_shelves, wooden_stool_01, hanging_picture_frame_01, calathea_orbifolia_01, vintage_oil_lamp,
pot_enamel_01, wooden_spoon, food_lime_01.

Texturas: old_wood_floor, painted_plaster_wall, long_white_tiles, wood_table_worn.
HDRI: residential_garden.

## Humano
- `readyplayer.me.glb`: avatar de Ready Player Me incluido en los ejemplos de three.js (r170).
- `Xbot.glb`: de los ejemplos de three.js; sus animaciones `idle` y `walk` (originales de Mixamo, Adobe)
  se reorientan en tiempo de carga al esqueleto del avatar.
- `Michelle.glb` (personaje de Mixamo, ejemplos de three.js): alternativa, con `?human=michelle`.
El repositorio de three.js es MIT, pero estos personajes y animaciones tienen sus propias condiciones
(Mixamo / Ready Player Me). Para una publicación comercial, revisa esas licencias o sustitúyelos.

## Tipografías
Cormorant Garamond e Inter (SIL Open Font License), vía Fontsource.

## Sonido
Todo el audio se sintetiza en tiempo real con Web Audio; no hay archivos de sonido.

## Para volver a descargar los assets
`python tools/fetch_assets.py`
