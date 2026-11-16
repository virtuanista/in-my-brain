# In My Brain

Una cocina, un martes a las 7:14. Métete en la cabeza de cualquier cosa (una mosca, la rata, la taza,
el cristal, el reloj…) y vive la misma mañana desde su percepción.

## Jugar
- **Carpeta `dist/`** (index.html + data/): abre `dist/index.html` con doble clic, sin servidor.
  También se sube tal cual a cualquier hosting estático. `release/InMyBrain.zip` es esa misma
  carpeta comprimida (para itch.io: tipo «HTML»).
- **Un solo archivo:** `release/InMyBrain.html` (todo incrustado, ~79 MB).

## Desarrollo
```
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/ + release/ (requiere Python + Pillow)
python tools/fetch_assets.py   # vuelve a descargar los assets
```
Créditos y licencias en `CREDITS.md`.
