# ================================================================
#  EARTH-WATCH — COMPLETE MINE DETECTION + ILLEGAL CLASSIFICATION
# ================================================================

import ee, os, sys, json, math, time, glob, urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

import numpy as np
import torch
import torch.nn as nn
import rasterio
from rasterio.enums     import Resampling
from rasterio.transform import from_bounds
from rasterio.merge     import merge as rio_merge
from rasterio.features  import shapes
from rasterio.windows   import from_bounds as win_from_bounds
from shapely.geometry   import shape, mapping
from shapely.ops        import unary_union
import segmentation_models_pytorch as smp
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import psycopg2
import psycopg2.extras

# ── All settings from central config (no hardcoded values) ──────
from backend.config import (
    GEE_PROJECT, MODEL_PATH, OUTPUT_DIR,
    TILE_KM, OVERLAP_FRAC, TARGET_SIZE, SCALE,
    CLOUD_THRESH, COMP_MONTHS, SEG_THRESHOLD, MINE_THRESHOLD,
    IOU_MERGE_THRESH, N_CHANNELS, S2_BANDS,
    TILE_CACHE_DIR, CACHE_VALID_DAYS,
    CENTROID_SEARCH_KM, BUFFER_M,
    IOU_LEGAL_THRESH, IOU_SUSPECT_THRESH,
    DB_DIRECT_CONFIG,
)

DB_CONFIG = DB_DIRECT_CONFIG  # alias used throughout this file

DEVICE = torch.device(
    'cuda' if torch.cuda.is_available() else
    'mps'  if torch.backends.mps.is_available() else
    'cpu'
)


# ================================================================
#  PART 1 — TILING
# ================================================================
def parse_bbox(gj_str):
    gj = json.loads(gj_str) if isinstance(gj_str, str) else gj_str
    if gj['type'] == 'FeatureCollection': gj = gj['features'][0]
    if gj['type'] == 'Feature':           gj = gj['geometry']
    pts  = gj['coordinates'][0]
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    return min(lons), min(lats), max(lons), max(lats)

def make_grid(minLon, minLat, maxLon, maxLat, tile_km=TILE_KM, step_frac=1.0):
    clat  = round((minLat + maxLat) / 2)
    d_lon = tile_km / (111.32 * math.cos(math.radians(clat)))
    d_lat = tile_km / 110.574
    start_lon = math.floor(minLon / (d_lon * step_frac)) * (d_lon * step_frac)
    start_lat = math.floor(minLat / (d_lat * step_frac)) * (d_lat * step_frac)
    tiles, row, lat = [], 0, start_lat
    while lat < maxLat:
        col, lon = 0, start_lon
        while lon < maxLon:
            tiles.append((row, col, (
                round(lon, 8), round(lat, 8),
                round(lon + d_lon, 8), round(lat + d_lat, 8),
            )))
            lon += d_lon * step_frac; col += 1
        lat += d_lat * step_frac; row += 1
    return tiles

# ================================================================
#  PART 2 — TILE CACHE
# ================================================================
def bbox_to_key(bb):
    return f"{bb[0]:.3f}_{bb[1]:.3f}_{bb[2]:.3f}_{bb[3]:.3f}"

def find_cached_tile(bb, cache_dir=TILE_CACHE_DIR):
    os.makedirs(cache_dir, exist_ok=True)
    cutoff = date.today() - timedelta(days=CACHE_VALID_DAYS)
    for fp in glob.glob(os.path.join(cache_dir, f"{bbox_to_key(bb)}_*.tif")):
        try:
            d = datetime.strptime(os.path.splitext(os.path.basename(fp))[0].split('_')[-1], '%Y-%m-%d').date()
        except ValueError:
            continue
        if d >= cutoff:
            return fp, d
        try: os.remove(fp)
        except: pass
    return None, None

def cache_tile_path(bb, cache_dir=TILE_CACHE_DIR):
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, f"{bbox_to_key(bb)}_{date.today()}.tif")

# ================================================================
#  PART 3 — GEE
# ================================================================
def init_gee():
    try:
        ee.Initialize(project=GEE_PROJECT); print("GEE initialized")
    except:
        ee.Authenticate(); ee.Initialize(project=GEE_PROJECT); print("GEE initialized")

def get_s2_composite(bb):
    import datetime as _dt
    today = _dt.date.today()
    ed = today.strftime('%Y-%m-%d')
    sd = (today - _dt.timedelta(days=COMP_MONTHS*30)).strftime('%Y-%m-%d')
    region = ee.Geometry.BBox(*bb)
    def mask_clouds(img):
        m = img.select('MSK_CLASSI_OPAQUE').eq(0).And(img.select('MSK_CLASSI_CIRRUS').eq(0))
        return img.updateMask(m).divide(10000).copyProperties(img, ['system:time_start'])
    col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
             .filterDate(sd, ed).filterBounds(region)
             .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_THRESH))
             .map(mask_clouds).select(S2_BANDS))
    if col.size().getInfo() == 0:
        col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                 .filterDate('2018-01-01', '2020-12-31').filterBounds(region)
                 .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                 .map(mask_clouds).select(S2_BANDS))
    fb = ee.Image.constant([0]*len(S2_BANDS)).rename(S2_BANDS).toFloat()
    return ee.Image(ee.Algorithms.If(col.size().gt(0), col.median(), fb)), region

def download_tile(bb, out_path, retries=3):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return 'exists'
    cp, cd = find_cached_tile(bb)
    if cp:
        import shutil; shutil.copy2(cp, out_path); return f'cache:{cd}'
    composite, region = get_s2_composite(bb)
    ncp = cache_tile_path(bb)
    for attempt in range(retries):
        try:
            url = composite.getDownloadURL({'bands':S2_BANDS,'region':region,'scale':SCALE,'crs':'EPSG:4326','format':'GEO_TIFF'})
            urllib.request.urlretrieve(url, ncp)
            import shutil; shutil.copy2(ncp, out_path); return 'downloaded'
        except Exception as e:
            if attempt < retries-1: time.sleep((attempt+1)*10)
            else:
                if os.path.exists(ncp): os.remove(ncp)
                raise

# ================================================================
#  PART 4 — RESIZE
# ================================================================
def resize_to_512(src, dst):
    with rasterio.open(src) as s:
        data = s.read(out_shape=(s.count,TARGET_SIZE,TARGET_SIZE), resampling=Resampling.bilinear).astype(np.float32)
        prof = s.profile.copy()
        prof.update({'width':TARGET_SIZE,'height':TARGET_SIZE,'transform':from_bounds(*s.bounds,TARGET_SIZE,TARGET_SIZE),'dtype':'float32'})
    with rasterio.open(dst,'w',**prof) as d: d.write(data)

# ================================================================
#  PART 5 — MODEL
# ================================================================
class MineDetector(nn.Module):
    def __init__(self):
        super().__init__()
        self.unet = smp.Unet(encoder_name='resnet34', encoder_weights=None,
                             in_channels=N_CHANNELS, classes=1,
                             decoder_attention_type='scse', activation=None)
        self.cls_head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1), nn.Flatten(),
            nn.Linear(512,256), nn.GELU(), nn.Dropout(0.3),
            nn.Linear(256,64),  nn.GELU(), nn.Dropout(0.2),
            nn.Linear(64,1))
    def forward(self, x):
        f = self.unet.encoder(x)
        d = self.unet.decoder(f)
        return self.unet.segmentation_head(d), self.cls_head(f[-1])

def load_model():
    print(f"Loading model: {MODEL_PATH}")
    ckpt  = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
    model = MineDetector().to(DEVICE)
    model.load_state_dict(ckpt['model_state']); model.eval()
    print(f"  Val IoU: {ckpt.get('val_iou',0):.4f}  Epoch: {ckpt.get('epoch','?')}")
    return model, ckpt['mean'], ckpt['std']

def preprocess(tif, mean, std):
    with rasterio.open(tif) as s:
        img = s.read().astype(np.float32); bounds = s.bounds; crs = s.crs
    img = np.nan_to_num(img, nan=0., posinf=1., neginf=0.)
    valid = img[0] > 0
    img = (img - mean.reshape(-1,1,1)) / std.reshape(-1,1,1)
    img[:,~valid] = 0.
    img = np.clip(img,-10.,10.); img = np.nan_to_num(img, nan=0.)
    return torch.from_numpy(img).float().unsqueeze(0).to(DEVICE), bounds, crs

@torch.no_grad()
def predict(model, tensor):
    so, co = model(tensor)
    sp = torch.sigmoid(so).squeeze().cpu().numpy()
    mp = torch.sigmoid(co).squeeze().cpu().item()
    return sp, (sp > SEG_THRESHOLD).astype(np.uint8), mp

# ================================================================
#  PART 6 — VECTORISE + DEDUP
# ================================================================
def mask_to_polygons(mask, bounds):
    if mask.max() == 0: return []
    transform = from_bounds(bounds.left,bounds.bottom,bounds.right,bounds.top,mask.shape[1],mask.shape[0])
    pd = (bounds.right - bounds.left) / mask.shape[1]
    polys = []
    for gd, val in shapes(mask, transform=transform):
        if val != 1: continue
        g = shape(gd)
        if not g.is_valid: g = g.buffer(0)
        if g.is_empty or g.area <= 0: continue
        g = g.simplify(pd*2, preserve_topology=True)
        if g.is_valid and not g.is_empty: polys.append(g)
    return polys

def deduplicate_polygons(polys, thresh=IOU_MERGE_THRESH):
    if not polys: return []
    parent = list(range(len(polys)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(x, y): parent[find(x)] = find(y)
    for i in range(len(polys)):
        for j in range(i+1, len(polys)):
            if not polys[i].intersects(polys[j]): continue
            try:
                inter = polys[i].intersection(polys[j]).area
                uni   = polys[i].union(polys[j]).area
                if (inter/uni if uni>0 else 0) > thresh: union(i,j)
            except: continue
    groups = defaultdict(list)
    for i in range(len(polys)): groups[find(i)].append(polys[i])
    result = []
    for ps in groups.values():
        try:
            m = unary_union(ps)
            if not m.is_valid: m = m.buffer(0)
            m = m.simplify(0.0001, preserve_topology=True)
            if not m.is_empty and m.area > 0: result.append(m)
        except: result.extend(ps)
    return result

def round_coords(geom, d=6):
    if geom['type'] == 'Polygon':
        return {'type':'Polygon','coordinates':[[[round(x,d),round(y,d)] for x,y in ring] for ring in geom['coordinates']]}
    elif geom['type'] == 'MultiPolygon':
        return {'type':'MultiPolygon','coordinates':[[[[round(x,d),round(y,d)] for x,y in ring] for ring in poly] for poly in geom['coordinates']]}
    return geom

# ================================================================
#  PART 7 — ILLEGAL CLASSIFICATION (PostGIS)
# ================================================================
def get_db_conn():
    try: return psycopg2.connect(**DB_CONFIG)
    except psycopg2.OperationalError as e:
        print(f"  [DB] Connection failed: {e}"); return None

def check_db_available():
    conn = get_db_conn()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) FROM legal_mines')
        n = cur.fetchone()[0]; cur.close(); conn.close()
        if n == 0: print("  [DB] legal_mines is empty"); return False
        print(f"  [DB] Connected — {n:,} legal mine records"); return True
    except Exception as e:
        print(f"  [DB] Error: {e}"); return False

def classify_mine_postgis(geojson_geom):
    conn = get_db_conn()
    if not conn: return _unverified("DB unavailable")
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            WITH detected AS (
                SELECT ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326) AS geom
            ),
            step1_candidates AS (
                SELECT l.id, l.geom FROM legal_mines l, detected d
                WHERE ST_DWithin(l.geom::geography, ST_Centroid(d.geom)::geography, %s * 1000)
            ),
            step2_buffer AS (
                SELECT c.id, c.geom FROM step1_candidates c, detected d
                WHERE ST_Intersects(ST_Buffer(d.geom::geography, %s)::geometry, c.geom)
            ),
            legal_union AS (
                SELECT ST_Union(geom) AS geom, COUNT(*) AS match_count FROM step2_buffer
            ),
            step3_iou AS (
                SELECT lu.match_count,
                    CASE WHEN lu.match_count = 0 THEN 0.0 ELSE
                        ROUND((ST_Area(ST_Intersection(d.geom, lu.geom)::geography)
                            / NULLIF(ST_Area(ST_Union(d.geom, lu.geom)::geography), 0))::numeric, 4)
                    END AS iou,
                    CASE WHEN lu.match_count = 0 THEN 0.0 ELSE
                        ROUND((ST_Area(ST_Intersection(d.geom, lu.geom)::geography)
                            / NULLIF(ST_Area(d.geom::geography), 0))::numeric, 4)
                    END AS overlap_pct
                FROM detected d, legal_union lu
            ),
            step4_centroid AS (
                SELECT BOOL_OR(ST_Within(ST_Centroid(d.geom), c.geom)) AS centroid_inside
                FROM detected d, step2_buffer c
            )
            SELECT s.match_count, s.iou, s.overlap_pct, c.centroid_inside,
                   ST_AsGeoJSON(lu.geom)::json AS legal_geom
            FROM step3_iou s, step4_centroid c, legal_union lu
        """, (json.dumps(geojson_geom), CENTROID_SEARCH_KM, BUFFER_M))
        row = cur.fetchone()
    except Exception as e:
        cur.close(); conn.close(); return _unverified(f"Query error: {e}")
    cur.close(); conn.close()

    if not row: return _unverified("No DB result")

    mc  = int(row['match_count']     or 0)
    iou = float(row['iou']           or 0.0)
    ovl = float(row['overlap_pct']   or 0.0)
    cin = bool(row['centroid_inside'] or False)
    legal_geom = row.get('legal_geom')

    if mc == 0:
        return {'verdict':'ILLEGAL','confidence':'HIGH',
                'reason':f'No legal mine within {CENTROID_SEARCH_KM}km',
                'iou':0.,'overlap_pct':0.,'centroid_inside':False,'legal_matches':0}
    if iou >= IOU_LEGAL_THRESH:
        return {'verdict':'LEGAL','confidence':'HIGH' if cin else 'MEDIUM',
                'reason':f'IoU={iou:.2f} — {ovl*100:.1f}% within legal boundary' + (' + centroid inside' if cin else ''),
                'iou':iou,'overlap_pct':ovl,'centroid_inside':cin,'legal_matches':mc,'legal_geom':legal_geom}
    if iou >= IOU_SUSPECT_THRESH:
        if cin:
            return {'verdict':'LEGAL','confidence':'LOW',
                    'reason':f'IoU={iou:.2f} borderline — centroid inside legal polygon',
                    'iou':iou,'overlap_pct':ovl,'centroid_inside':True,'legal_matches':mc,'legal_geom':legal_geom}
        return {'verdict':'SUSPECT','confidence':'MEDIUM',
                'reason':f'IoU={iou:.2f} — only {ovl*100:.1f}% overlap — partial boundary violation',
                'iou':iou,'overlap_pct':ovl,'centroid_inside':False,'legal_matches':mc}
    if cin:
        return {'verdict':'SUSPECT','confidence':'LOW',
                'reason':f'IoU={iou:.2f} low but centroid inside legal polygon — boundary mismatch',
                'iou':iou,'overlap_pct':ovl,'centroid_inside':True,'legal_matches':mc}
    return {'verdict':'ILLEGAL','confidence':'MEDIUM',
            'reason':f'IoU={iou:.2f} — {ovl*100:.1f}% overlap — operating outside legal area',
            'iou':iou,'overlap_pct':ovl,'centroid_inside':False,'legal_matches':mc}

def _unverified(reason):
    return {'verdict':'UNVERIFIED','confidence':'NONE','reason':reason,
            'iou':0.,'overlap_pct':0.,'centroid_inside':False,'legal_matches':0}

# ================================================================
#  PART 8 — VISUALISATION
# ================================================================
def save_summary_viz(results, out_path):
    n = len(results)
    if n == 0: return
    cols = min(4,n); rows = int(np.ceil(n/cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols*5, rows*5))
    fig.patch.set_facecolor('#0f0f0f')
    if n==1: axes = np.array([[axes]])
    elif rows==1: axes = axes.reshape(1,-1)
    for idx, r in enumerate(results):
        ax = axes[idx//cols][idx%cols]
        with rasterio.open(r['tif_path']) as s: raw = s.read().astype(np.float32)
        rgb = np.stack([raw[2],raw[1],raw[0]], axis=-1)
        for c in range(3):
            v = rgb[...,c][rgb[...,c]>0]
            if len(v)>10:
                p2,p98 = np.percentile(v,[2,98])
                rgb[...,c] = np.clip((rgb[...,c]-p2)/(p98-p2+1e-6),0,1)
        ax.imshow(rgb)
        if r['seg_mask'].max() > 0:
            ov = np.zeros((*r['seg_mask'].shape,4), dtype=np.float32)
            ov[r['seg_mask']>0] = [1.,0.,0.,0.45]; ax.imshow(ov)
        ax.set_title(f"{r['name']}\nprob={r['mine_prob']:.1%} cov={r['mine_pct']:.1f}%",
                     color='red', fontsize=8, pad=3)
        ax.axis('off')
    for idx in range(n, rows*cols): axes[idx//cols][idx%cols].axis('off')
    plt.suptitle(f"MINE DETECTIONS — {n} patches", color='white', fontsize=11, y=1.01)
    plt.tight_layout()
    plt.savefig(out_path, dpi=100, bbox_inches='tight', facecolor='#0f0f0f')
    plt.close()

# ================================================================
#  MAIN
# ================================================================
def run(geojson_str):
    import datetime as _dt
    import shutil as _shutil
    def _ts(): return _dt.datetime.now().strftime('%H:%M:%S')

    raw_dir   = os.path.join(OUTPUT_DIR,'_raw')
    ind_dir   = os.path.join(OUTPUT_DIR,'individual')
    ov_dir    = os.path.join(OUTPUT_DIR,'overlapping')
    viz_dir   = os.path.join(OUTPUT_DIR,'visualizations')
    masks_dir = os.path.join(OUTPUT_DIR,'_masks')

    for d in [raw_dir, ind_dir, ov_dir, masks_dir]:
        if os.path.exists(d): _shutil.rmtree(d)
    for d in [raw_dir, ind_dir, ov_dir, viz_dir, masks_dir]:
        os.makedirs(d, exist_ok=True)

    bbox = parse_bbox(geojson_str)
    print(f"\n{'='*62}\n  EARTH-WATCH — DETECTION + CLASSIFICATION\n{'='*62}")
    print(f"  AOI: lon [{bbox[0]:.4f},{bbox[2]:.4f}] lat [{bbox[1]:.4f},{bbox[3]:.4f}]")
    print(f"  Device: {DEVICE}\n")

    init_gee()
    model, mean, std = load_model()
    db_ok = check_db_available()
    print()

    # STEP 1 — Individual tiles
    ind_tiles = make_grid(*bbox, tile_km=TILE_KM, step_frac=1.0)
    nr = max(t[0] for t in ind_tiles)+1; nc = max(t[1] for t in ind_tiles)+1
    print(f"[1/3] Individual tiles ({nr}x{nc}={len(ind_tiles)}) [{_ts()}]")
    ind_map = {}
    for idx,(row,col,bb) in enumerate(ind_tiles):
        name = f'tile_r{row:02d}_c{col:02d}'
        rp   = os.path.join(raw_dir, f'{name}.tif')
        op   = os.path.join(ind_dir,  f'{name}.tif')
        print(f"  [{idx+1:2d}/{len(ind_tiles)}] {name}", end=' ... ', flush=True)
        try:
            st = download_tile(bb, rp); resize_to_512(rp, op); ind_map[(row,col)] = rp
            sz = os.path.getsize(op)/1e6
            tag = f"[CACHED {st.split(':')[1]}]" if st.startswith('cache') else '[EXISTS]' if st=='exists' else '[NEW]'
            print(f"{tag} ({sz:.1f}MB) [{_ts()}]")
        except Exception as e: print(f"FAILED: {e}")

    # STEP 2 — Overlapping tiles
    ov_tiles = make_grid(*bbox, tile_km=TILE_KM, step_frac=OVERLAP_FRAC)
    print(f"\n[2/3] Overlapping tiles [{_ts()}]")
    raw_idx = []
    for rp in ind_map.values():
        if os.path.exists(rp):
            with rasterio.open(rp) as s: raw_idx.append((s.bounds, rp))

    for idx,(row,col,bb) in enumerate(ov_tiles):
        name = f'overlap_r{row:02d}_c{col:02d}'; op = os.path.join(ov_dir, f'{name}.tif')
        print(f"  [{idx+1:3d}/{len(ov_tiles)}] {name}", end=' ... ', flush=True)
        try:
            contrib = [rp for (bnd,rp) in raw_idx
                       if bnd.left<bb[2] and bnd.right>bb[0] and bnd.bottom<bb[3] and bnd.top>bb[1]]
            if not contrib:
                rp = os.path.join(raw_dir, f'{name}.tif'); download_tile(bb, rp); resize_to_512(rp, op)
            elif len(contrib)==1:
                with rasterio.open(contrib[0]) as s:
                    w = win_from_bounds(*bb, s.transform); data = s.read(window=w)
                    wt = s.window_transform(w); prof = s.profile.copy()
                    prof.update({'height':data.shape[1],'width':data.shape[2],'transform':wt})
                tmp = op+'.tmp.tif'
                with rasterio.open(tmp,'w',**prof) as d: d.write(data)
                resize_to_512(tmp, op); os.remove(tmp)
            else:
                dss = [rasterio.open(p) for p in contrib]
                md,mt = rio_merge(dss, bounds=bb, res=SCALE/111320)
                prof  = dss[0].profile.copy()
                prof.update({'height':md.shape[1],'width':md.shape[2],'transform':mt,'dtype':'float32'})
                for ds in dss: ds.close()
                tmp = op+'.tmp.tif'
                with rasterio.open(tmp,'w',**prof) as d: d.write(md.astype(np.float32))
                resize_to_512(tmp, op); os.remove(tmp)
            print(f"ok ({os.path.getsize(op)/1e6:.1f}MB)")
        except Exception as e: print(f"FAILED: {e}")

    # STEP 3 — Inference
    tifs = sorted(glob.glob(os.path.join(ov_dir,'*.tif')))
    print(f"\n[3/3] Inference on {len(tifs)} tiles [{_ts()}]")
    all_polys=[]; mine_results=[]; all_results=[]
    for idx,tif in enumerate(tifs):
        name = os.path.splitext(os.path.basename(tif))[0]
        print(f"  [{idx+1:3d}/{len(tifs)}] {name}", end=' ... ', flush=True)
        try:
            tensor,bounds,_ = preprocess(tif, mean, std)
            sp,mask,mp      = predict(model, tensor)
            detected        = mp > MINE_THRESHOLD
            pct             = mask.mean()*100
            if detected:
                polys = mask_to_polygons(mask, bounds); all_polys.extend(polys)
                mine_results.append({'name':name,'tif_path':tif,'seg_mask':mask,'seg_prob':sp,'mine_prob':mp,'mine_pct':pct})
                np.save(os.path.join(masks_dir, f'{name}.npy'), mask)
                print(f"MINE prob={mp:.3f} cov={pct:.1f}%")
            else:
                print(f"clean prob={mp:.3f}")
            all_results.append({'tile':name,'mine_prob':round(float(mp),4),'mine_pct':round(float(pct),4),'mine_detected':detected})
        except Exception as e:
            print(f"FAILED: {e}"); all_results.append({'tile':name,'error':str(e)})

    print(f"\n  Raw polygons : {len(all_polys)}")
    dedup = deduplicate_polygons(all_polys, IOU_MERGE_THRESH)
    MIN_AREA_KM2 = 0.50
    dedup = [p for p in dedup if p.area * 111.32 * 110.574 >= MIN_AREA_KM2]
    print(f"  After dedup  : {len(dedup)} (filtered < {MIN_AREA_KM2} km²)")

    counts  = {'ILLEGAL':0,'SUSPECT':0,'LEGAL':0,'UNVERIFIED':0}
    features = []

    if db_ok:
        print(f"\n  Classifying {len(dedup)} mines...")

    for i, poly in enumerate(dedup):
        geom     = round_coords(mapping(poly))
        area_km2 = round(poly.area*111.32*110.574, 4)
        props    = {'mine_id':i+1,'area_km2':area_km2}
        if db_ok:
            clf = classify_mine_postgis(geom)
            props.update(clf)
            v = clf['verdict']; counts[v] += 1
            print(f"  Mine #{i+1} ({area_km2:.2f}km²) -> {v} [iou={clf['iou']:.2f}]")
        else:
            props.update({'verdict':'UNVERIFIED','confidence':'NONE','reason':'DB unavailable'})
            counts['UNVERIFIED'] += 1
        features.append({'type':'Feature','properties':props,'geometry':geom})

    out_gj = {'type':'FeatureCollection','features':features}
    with open(os.path.join(OUTPUT_DIR,'detected_mines.geojson'),'w') as f: json.dump(out_gj, f, indent=2)
    illegal_feats = [f for f in features if f['properties'].get('verdict') in ('ILLEGAL','SUSPECT')]
    with open(os.path.join(OUTPUT_DIR,'illegal_mines.geojson'),'w') as f:
        json.dump({'type':'FeatureCollection','features':illegal_feats}, f, indent=2)
    with open(os.path.join(OUTPUT_DIR,'all_results.json'),'w') as f: json.dump(all_results, f, indent=2)
    if mine_results: save_summary_viz(mine_results, os.path.join(viz_dir,'mine_detections.png'))

    print(f"\n{'='*62}\n  RESULTS: {len(dedup)} mines detected\n{'='*62}\n")
    return out_gj

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 mine_detection.py area.geojson")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        gj = f.read()
    run(gj)
