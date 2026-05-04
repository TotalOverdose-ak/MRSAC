import sys, os, tempfile
sys.stdout.reconfigure(encoding='utf-8')
from pptx import Presentation
from pptx.util import Pt, Emu, Inches
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# Load full PPT as base
prs = Presentation(r'C:\Users\AkashK\Downloads\Earth-Watch\full.pptx')
SW = prs.slide_width
FONT = 'Times New Roman'

# Colors from template
PURPLE = RGBColor(0x70, 0x30, 0xA0)
FIRE_COL = RGBColor(0xC6, 0x28, 0x28)  # Deep red for fire headers
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLACK = RGBColor(0x00, 0x00, 0x00)
GRAY = RGBColor(0x55, 0x55, 0x55)
GREEN = RGBColor(0x1B, 0x5E, 0x20)
ORANGE = RGBColor(0xE6, 0x51, 0x00)
BLUE = RGBColor(0x15, 0x65, 0xC0)
TEAL = RGBColor(0x00, 0x69, 0x5C)

# Get footer image
footer_blob = None
for shape in prs.slides[11].shapes:
    if shape.shape_type == 13:
        try: footer_blob = shape.image.blob; break
        except: pass

def new_slide():
    return prs.slides.add_slide(prs.slide_layouts[0])

# ── Header bar (matching mining slide style: full-width purple bar) ──
def header(slide, title, subtitle='', color=PURPLE):
    # Main title bar
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Emu(8165), SW, Emu(479822))
    bar.fill.solid(); bar.fill.fore_color.rgb = color; bar.line.fill.background()
    tx = slide.shapes.add_textbox(0, Emu(8165), SW, Emu(479822))
    tf = tx.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    run = p.add_run(); run.text = title
    run.font.name = FONT; run.font.size = Pt(26); run.font.bold = True; run.font.color.rgb = WHITE
    # Subtitle bar (city names bar from template)
    if subtitle:
        bar2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Emu(4846320), SW, Emu(297180))
        bar2.fill.solid(); bar2.fill.fore_color.rgb = color; bar2.line.fill.background()
        tx2 = slide.shapes.add_textbox(0, Emu(4846320), SW, Emu(297180))
        tf2 = tx2.text_frame; tf2.vertical_anchor = MSO_ANCHOR.MIDDLE
        p2 = tf2.paragraphs[0]; p2.alignment = PP_ALIGN.CENTER
        r2 = p2.add_run(); r2.text = subtitle
        r2.font.name = FONT; r2.font.size = Pt(8); r2.font.color.rgb = WHITE

def footer(slide):
    if footer_blob:
        tmp = os.path.join(tempfile.gettempdir(), 'ftr.jpg')
        with open(tmp, 'wb') as f: f.write(footer_blob)
        slide.shapes.add_picture(tmp, 0, Emu(4884540), SW, Emu(258961))

# ── Styled flow box (like mining workflow boxes) ──
def flow_box(slide, l, t, w, h, text, bold=True, fill=WHITE, border=PURPLE, font_sz=12, font_col=BLACK):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(l), Emu(t), Emu(w), Emu(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    shp.line.color.rgb = border; shp.line.width = Pt(1.5)
    tf = shp.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    run = p.add_run(); run.text = text
    run.font.name = FONT; run.font.size = Pt(font_sz); run.font.bold = bold; run.font.color.rgb = font_col
    return shp

# ── Arrow between boxes ──
def arrow_down(slide, cx, y, length=180000):
    shp = slide.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Emu(cx - 80000), Emu(y), Emu(160000), Emu(length))
    shp.fill.solid(); shp.fill.fore_color.rgb = GRAY
    shp.line.fill.background()

# ── Section label (colored rectangle with white text, like mining) ──
def section_label(slide, l, t, w, h, text, color=PURPLE):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(l), Emu(t), Emu(w), Emu(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = color
    shp.line.fill.background()
    tf = shp.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    run = p.add_run(); run.text = text
    run.font.name = FONT; run.font.size = Pt(13); run.font.bold = True; run.font.color.rgb = WHITE

# ── Key-value pair (like mining Key Specs rows) ──
def kv_row(slide, l, t, kw, vw, h, key, value, key_col=PURPLE):
    # Key box
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(l), Emu(t), Emu(kw), Emu(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = RGBColor(0xF3, 0xF0, 0xFA)
    shp.line.color.rgb = RGBColor(0xDD, 0xDD, 0xDD); shp.line.width = Pt(0.5)
    tf = shp.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    run = p.add_run(); run.text = key
    run.font.name = FONT; run.font.size = Pt(10); run.font.bold = True; run.font.color.rgb = key_col
    # Value box
    shp2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(l+kw), Emu(t), Emu(vw), Emu(h))
    shp2.fill.solid(); shp2.fill.fore_color.rgb = WHITE
    shp2.line.color.rgb = RGBColor(0xDD, 0xDD, 0xDD); shp2.line.width = Pt(0.5)
    tf2 = shp2.text_frame; tf2.vertical_anchor = MSO_ANCHOR.MIDDLE
    p2 = tf2.paragraphs[0]
    run2 = p2.add_run(); run2.text = value
    run2.font.name = FONT; run2.font.size = Pt(10); run2.font.color.rgb = BLACK

# ── Simple text ──
def txt(slide, l, t, w, h, text, sz=11, col=BLACK, bold=False, al=PP_ALIGN.LEFT):
    tx = slide.shapes.add_textbox(Emu(l), Emu(t), Emu(w), Emu(h))
    tf = tx.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = al
    run = p.add_run(); run.text = text
    run.font.name = FONT; run.font.size = Pt(sz); run.font.color.rgb = col; run.font.bold = bold

# ── Bullet text (multi-line, clean) ──
def bullets(slide, l, t, w, items, sz=10, col=BLACK):
    tx = slide.shapes.add_textbox(Emu(l), Emu(t), Emu(w), Emu(len(items)*200000))
    tf = tx.text_frame; tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run(); run.text = f"\u2022  {item}"
        run.font.name = FONT; run.font.size = Pt(sz); run.font.color.rgb = col
        p.space_after = Pt(2)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 1: LULC — Analytical Report & Multi-Year Comparison
# ═══════════════════════════════════════════════════════════════════════
s = new_slide()
header(s, "LULC : Analytical Report & Temporal Analysis")

# LEFT SIDE — "8 Map Output Layers"
section_label(s, 200000, 600000, 2000000, 320000, "8 Map Layers")

rows = [
    ("LULC Map", "9-class land cover classification"),
    ("RGB Composite", "True-color satellite view"),
    ("NDVI", "Vegetation health index"),
    ("NDBI", "Built-up / urban index"),
    ("MNDWI", "Water body index"),
    ("Built Prob.", "Urban area confidence heatmap"),
    ("Trees Prob.", "Tree cover confidence heatmap"),
    ("Crops Prob.", "Cropland confidence heatmap"),
]
y = 1000000
for key, val in rows:
    kv_row(s, 200000, y, 1200000, 2800000, 260000, key, val)
    y += 260000

# LEFT BOTTOM — "5 Seasonal Composites"
section_label(s, 200000, 3200000, 2200000, 300000, "5 Season Modes")
seasons = [
    ("Annual", "Jan–Dec  |  Full year overview"),
    ("Kharif", "Jul–Oct  |  Monsoon paddy season"),
    ("Rabi", "Nov–Mar  |  Winter wheat season"),
    ("Dry/Wet", "Post-monsoon & peak monsoon"),
]
y = 3580000
for key, val in seasons:
    kv_row(s, 200000, y, 1000000, 3000000, 250000, key, val)
    y += 250000

# RIGHT SIDE — "Analytical Report"
section_label(s, 4700000, 600000, 2600000, 320000, "Analytical Report")

bullets(s, 4700000, 1020000, 4200000, [
    "SVG Donut Chart — class-wise area distribution",
    "Bar Chart — area per class in km\u00b2 with labels",
    "Summary card — total area, dominant class, year, season",
    "Full 9-class color legend (Dynamic World palette)",
    "One-click PDF download with unique report ID",
    "Uses html-to-image + jsPDF (browser rendering)",
], sz=10)

# RIGHT BOTTOM — "Multi-Year Comparison"
section_label(s, 4700000, 2500000, 3200000, 320000, "Multi-Year Comparison", TEAL)

bullets(s, 4700000, 2920000, 4200000, [
    "Compare LULC across 2\u20134 years (2017 to 2025)",
    "Separate API call per year for independent analysis",
    "Side-by-side grouped bar chart per class per year",
    "Change cards show % shift over time:",
    '   "Trees \u2193 \u221212.3%"   "Built Area \u2191 +8.7%"',
    "Detects urbanization, deforestation, crop changes",
], sz=10)

# Note at bottom
txt(s, 200000, 4650000, 8700000, 200000,
    "Note: Salt Pan Fix — Dynamic World misclassifies salt pans as Snow. Our system remaps Class 8 \u2192 Class 7 (Bare Ground) for Indian landscapes.",
    sz=8, col=GRAY, al=PP_ALIGN.LEFT)
footer(s)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 2: FIRMS — NASA Fire Detection Database
# ═══════════════════════════════════════════════════════════════════════
s = new_slide()
header(s, "Forest Fire : NASA FIRMS \u2014 17M+ Fire Detections", color=FIRE_COL)

# LEFT: "What is FIRMS?"
section_label(s, 200000, 600000, 2200000, 300000, "What is FIRMS?", FIRE_COL)
bullets(s, 200000, 980000, 4200000, [
    "NASA\u2019s Fire Information for Resource Management System",
    "Detects fire using thermal satellite sensors (heat, not smoke)",
    "5 satellites: MODIS (Aqua/Terra), Suomi-NPP, NOAA-20, NOAA-21",
    "MODIS sensor: 1 km resolution | VIIRS sensor: 375m resolution",
], sz=10)

# LEFT: Data specs as KV rows
section_label(s, 200000, 1850000, 2200000, 300000, "Our Data Pipeline", FIRE_COL)
specs = [
    ("Total Records", "17,000,000+ fire detection points"),
    ("Data Size", "~1.29 GB (CSV files)"),
    ("Coverage", "All of India, 2001 \u2013 2025 (24 years)"),
    ("Loading", "All CSVs loaded into RAM at startup"),
    ("Spatial Index", "KD-Tree for O(log n) fast queries"),
    ("RAM Usage", "~500 MB (optimized dtypes)"),
]
y = 2230000
for k, v in specs:
    kv_row(s, 200000, y, 1300000, 2900000, 260000, k, v, FIRE_COL)
    y += 260000

# RIGHT: Hotspot Visualization
section_label(s, 4700000, 600000, 2800000, 300000, "Map Visualization", FIRE_COL)
bullets(s, 4700000, 980000, 4200000, [
    "Each fire detection = styled circle on map",
    "Circle size \u221d FRP (Fire Radiative Power in MW)",
    "Circle color \u221d brightness temperature (300K\u2192420K)",
    "User filters: date range + confidence threshold",
], sz=10)

# RIGHT: Analytics
section_label(s, 4700000, 1850000, 2800000, 300000, "Fire Analytics (Report)", FIRE_COL)
analytics = [
    ("Total Fires", "Count of fire detections in AOI"),
    ("Monthly Chart", "Which months have most fires"),
    ("Yearly Trend", "Fires increasing or decreasing?"),
    ("Peak Month", "Consistently hottest fire month"),
    ("Avg/Max FRP", "Fire intensity in MegaWatts"),
    ("Day/Night", "% fires detected day vs night"),
    ("Confidence", "High / Medium / Low breakdown"),
    ("Satellites", "Fire count per satellite source"),
]
y = 2230000
for k, v in analytics:
    kv_row(s, 4700000, y, 1200000, 3100000, 250000, k, v, FIRE_COL)
    y += 250000

# Bottom note
txt(s, 200000, 4650000, 8700000, 200000,
    "3 API Endpoints:  /api/fire/hotspots (map points)   |   /api/fire/stats (analytics)   |   /api/fire/risk (ML prediction)",
    sz=8, col=GRAY, al=PP_ALIGN.CENTER)
footer(s)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 3: ML Fire Risk Prediction
# ═══════════════════════════════════════════════════════════════════════
s = new_slide()
header(s, "Forest Fire : ML Fire Risk Prediction", color=FIRE_COL)

# LEFT: Model specs
section_label(s, 200000, 600000, 2400000, 300000, "Model Architecture", FIRE_COL)
model = [
    ("Algorithm", "Random Forest Regressor"),
    ("Estimators", "200 trees, max depth = 12"),
    ("Training Data", "17M+ NASA FIRMS detections"),
    ("Training Grid", "0.1\u00b0 cells (~11 km) over India"),
    ("Prediction Grid", "0.01\u00b0 cells (~1.1 km) for AOI"),
    ("Validation", "Temporal: train <2025, test on 2025"),
    ("Output", "Fire risk score 0\u2013100 per cell"),
]
y = 980000
for k, v in model:
    kv_row(s, 200000, y, 1400000, 2750000, 270000, k, v, FIRE_COL)
    y += 270000

# LEFT: Risk score levels
section_label(s, 200000, 3000000, 2400000, 300000, "Risk Score Levels", RGBColor(0xB7, 0x1C, 0x1C))
risk_rows = [
    ("0 \u2013 40", "Low Risk", GREEN),
    ("40 \u2013 75", "Moderate Risk", ORANGE),
    ("75 \u2013 100", "High / Extreme", RGBColor(0xB7, 0x1C, 0x1C)),
]
y = 3380000
for score, level, col in risk_rows:
    # Score box
    shp = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(200000), Emu(y), Emu(1000000), Emu(300000))
    shp.fill.solid(); shp.fill.fore_color.rgb = WHITE
    shp.line.color.rgb = RGBColor(0xDD, 0xDD, 0xDD); shp.line.width = Pt(0.5)
    tf = shp.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    run = p.add_run(); run.text = score
    run.font.name = FONT; run.font.size = Pt(11); run.font.bold = True; run.font.color.rgb = BLACK
    # Level box (colored)
    shp2 = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(1200000), Emu(y), Emu(2950000), Emu(300000))
    shp2.fill.solid(); shp2.fill.fore_color.rgb = col
    shp2.line.fill.background()
    tf2 = shp2.text_frame; tf2.vertical_anchor = MSO_ANCHOR.MIDDLE
    p2 = tf2.paragraphs[0]; p2.alignment = PP_ALIGN.CENTER
    run2 = p2.add_run(); run2.text = level
    run2.font.name = FONT; run2.font.size = Pt(12); run2.font.bold = True; run2.font.color.rgb = WHITE
    y += 310000

# RIGHT: 12 Features
section_label(s, 4700000, 600000, 3200000, 300000, "12 Engineered Features", FIRE_COL)
features = [
    ("fire_count", "Total historical fire detections"),
    ("fire_density", "Fires per year (normalized)"),
    ("mean_frp", "Average fire intensity (MW)"),
    ("max_frp", "Worst-case intensity ever recorded"),
    ("mean_brightness", "Avg brightness temperature (K)"),
    ("fire_years", "How many unique years had fires"),
    ("recurrence_rate", "Proportion of years with fire"),
    ("seasonal_conc.", "Fire concentrated in few months?"),
    ("peak_month", "Single highest fire month count"),
    ("mean_confidence", "Average detection confidence"),
    ("recent_trend", "Last 5 years: fires increasing?"),
    ("neighbor_density", "Fires in 8 adjacent grid cells"),
]
y = 980000
for k, v in features:
    kv_row(s, 4700000, y, 1400000, 2900000, 240000, k, v, FIRE_COL)
    y += 240000

# RIGHT BOTTOM: 3 Engines
section_label(s, 4700000, 3950000, 3800000, 300000, "3 Complementary Fire Engines", RGBColor(0xB7, 0x1C, 0x1C))
flow_box(s, 4700000, 4330000, 1200000, 250000, "dNBR", fill=RGBColor(0xFF, 0xF3, 0xE0), border=ORANGE, font_sz=10, font_col=ORANGE)
txt(s, 5950000, 4360000, 600000, 200000, "Past", sz=9, col=ORANGE, bold=True)
flow_box(s, 6400000, 4330000, 1100000, 250000, "FIRMS", fill=RGBColor(0xE3, 0xF2, 0xFD), border=BLUE, font_sz=10, font_col=BLUE)
txt(s, 7550000, 4360000, 700000, 200000, "History", sz=9, col=BLUE, bold=True)
flow_box(s, 8050000, 4330000, 900000, 250000, "ML", fill=RGBColor(0xFC, 0xE4, 0xEC), border=FIRE_COL, font_sz=10, font_col=FIRE_COL)
txt(s, 8200000, 4600000, 700000, 200000, "Future", sz=9, col=FIRE_COL, bold=True)

footer(s)


# ═══════════════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════════════
out = r'C:\Users\AkashK\Downloads\Earth-Watch\LULC_Fire_v2.pptx'
prs.save(out)
print(f"Done! Saved: {out}")
print(f"Total slides: {len(prs.slides)}")
print(f"New slides: {len(prs.slides)-26} (at the end: Slide {len(prs.slides)-2}, {len(prs.slides)-1}, {len(prs.slides)})")
