"""Descarga assets CC0 de Poly Haven a public/assets respetando rutas relativas."""
import json, os, sys, urllib.request, concurrent.futures as cf

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
UA = {'User-Agent': 'imb-game-asset-fetcher'}

MODELS = {
  'dining_table':'2k','dining_chair_02':'1k','tea_set_01':'2k','vintage_electric_kettle':'2k',
  'croissant':'2k','carved_wooden_plate':'1k','wooden_bowl_01':'1k','food_apple_01':'1k',
  'lemon':'1k','bananas':'1k','food_pears_asian_01':'1k','street_rat':'2k','mousetrap':'2k',
  'wall_clock':'1k','potted_plant_02':'1k','potted_plant_04':'1k','painted_wooden_cabinet':'1k',
  'electric_stove':'1k','caged_hanging_light':'1k','wine_bottles_01':'1k','jug_01':'1k',
  'book_encyclopedia_set_01':'1k','round_spectacles':'2k','wooden_cutting_board':'1k',
  'yellow_onion':'1k','wicker_basket_01':'1k','painted_wooden_shelves':'1k','brass_pot_01':'1k',
  'wooden_stool_01':'1k','hanging_picture_frame_01':'1k','calathea_orbifolia_01':'1k',
  'vintage_oil_lamp':'1k','pot_enamel_01':'1k','wooden_spoon':'1k','food_lime_01':'1k',
}
TEXTURES = {'old_wood_floor':'2k','painted_plaster_wall':'2k','long_white_tiles':'2k','wood_table_worn':'1k'}
HDRIS = {'residential_garden':'2k'}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()

def save(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, 'wb') as f: f.write(data)

jobs = []
for name, res in MODELS.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
    g = files['gltf'][res]['gltf']
    base = os.path.join(ROOT, 'models', name)
    jobs.append((g['url'], os.path.join(base, f'{name}.gltf')))
    for rel, inc in g['include'].items():
        jobs.append((inc['url'], os.path.join(base, rel)))
for name, res in TEXTURES.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
    for key, fn in (('Diffuse','diff'),('nor_gl','nor'),('arm','arm')):
        if key in files:
            jobs.append((files[key][res]['jpg']['url'], os.path.join(ROOT, 'textures', name, f'{fn}.jpg')))
for name, res in HDRIS.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
    jobs.append((files['hdri'][res]['hdr']['url'], os.path.join(ROOT, 'hdri', f'{name}_{res}.hdr')))

with cf.ThreadPoolExecutor(8) as ex:
    futs = {ex.submit(save, u, p): p for u, p in jobs}
    for f in cf.as_completed(futs):
        try: f.result()
        except Exception as e: print('FAIL', futs[f], e)
# humano: avatar y animaciones de los ejemplos de three.js (r170)
for f in ('readyplayer.me.glb', 'Xbot.glb', 'Michelle.glb'):
    jobs.append((f'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/{f}', os.path.join(ROOT, 'models', 'human', f)))
    save(*jobs[-1])
print('ok', len(jobs), 'files')
