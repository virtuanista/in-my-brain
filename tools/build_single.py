"""
Crea dist/ (index.html + data/*.js, se abre con doble clic sin servidor),
release/InMyBrain.zip (esa carpeta, para subir) y release/InMyBrain.html (todo en un archivo).

1. `vite build --mode single` ya ha dejado dist-single/index.html con el JS y el CSS en línea.
2. Este script recomprime las texturas JPEG y mete todos los assets (modelos, texturas, HDRI)
   en base64 dentro de window.__ASSETS. El cargador de src/core/assets.js los convierte en blob: URLs.
"""
import base64, io, json, os, shutil, sys, zipfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'public', 'assets')
SRC_HTML = os.path.join(ROOT, 'dist-single', 'index.html')
OUT_DIR = os.path.join(ROOT, 'release')
OUT = os.path.join(OUT_DIR, 'InMyBrain.html')

SKIP = {'models/human/Michelle.glb'}          # alternativa opcional, no se usa por defecto
KEEP_2K = ('textures/', 'models/street_rat/', 'models/croissant/')  # lo que se ve en macro


def recompress(rel, data):
    im = Image.open(io.BytesIO(data))
    im.load()
    if im.width > 1024 and not rel.startswith(KEEP_2K):
        im = im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS)
    name = os.path.basename(rel)
    normal = '_nor' in name or name.startswith('nor')
    out = io.BytesIO()
    im.convert('RGB').save(out, 'JPEG', quality=90 if normal else 84, optimize=True, progressive=True,
                            subsampling=0 if normal else 2)
    b = out.getvalue()
    return b if len(b) < len(data) else data


def main():
    if not os.path.exists(SRC_HTML):
        sys.exit('Falta dist-single/index.html: ejecuta antes `npx vite build --mode single`.')
    html = open(SRC_HTML, encoding='utf8').read()
    files, optimized, before, after = {}, {}, 0, 0
    for dp, _, fns in os.walk(ASSETS):
        for fn in fns:
            full = os.path.join(dp, fn)
            rel = os.path.relpath(full, ASSETS).replace(os.sep, '/')
            if rel in SKIP:
                continue
            data = open(full, 'rb').read()
            before += len(data)
            if fn.lower().endswith('.jpg'):
                data = recompress(rel, data)
            after += len(data)
            files[rel] = base64.b64encode(data).decode('ascii')
            optimized[rel] = data
    payload = '<script>window.__ASSETS=' + json.dumps(files, separators=(',', ':')) + ';</script>'
    # antes de cualquier otro script del documento
    i = html.index('<head>') + len('<head>')
    html = html[:i] + payload + html[i:]
    os.makedirs(OUT_DIR, exist_ok=True)
    open(OUT, 'w', encoding='utf8').write(html)
    # carpeta para subir: index.html + data/*.js (assets troceados en scripts clásicos).
    # Los <script src> clásicos sí cargan desde file://, así que la carpeta funciona igual
    # abierta con doble clic que subida a cualquier hosting estático (itch.io, Netlify…).
    src_html = open(SRC_HTML, encoding='utf8').read()
    folder = os.path.join(ROOT, 'dist')
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(os.path.join(folder, 'data'))
    packs, cur, size, n = [], {}, 0, 0
    for k, v in files.items():
        cur[k] = v; size += len(v)
        if size > 8_000_000:
            packs.append(cur); cur, size = {}, 0
    if cur: packs.append(cur)
    tags = []
    for i, pk in enumerate(packs):
        fn = f'data/pack{i:02d}.js'
        open(os.path.join(folder, fn), 'w', encoding='utf8').write(
            'window.__ASSETS=Object.assign(window.__ASSETS||{},' + json.dumps(pk, separators=(',', ':')) + ');')
        tags.append(f'<script src="{fn}"></script>')
    j = src_html.index('<head>') + len('<head>')
    open(os.path.join(folder, 'index.html'), 'w', encoding='utf8').write(src_html[:j] + ''.join(tags) + src_html[j:])
    zpath = os.path.join(OUT_DIR, 'InMyBrain.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_STORED) as z:
        for dp, _, fns in os.walk(folder):
            for fn in fns:
                full = os.path.join(dp, fn)
                z.write(full, os.path.relpath(full, folder).replace(os.sep, '/'))
    print(f'carpeta: {folder}  ({len(packs)} paquetes)  zip: {os.path.getsize(zpath)/1e6:.1f} MB')
    print(f'{len(files)} assets  {before/1e6:.1f} MB -> {after/1e6:.1f} MB  |  {OUT}  {os.path.getsize(OUT)/1e6:.1f} MB')


if __name__ == '__main__':
    main()
