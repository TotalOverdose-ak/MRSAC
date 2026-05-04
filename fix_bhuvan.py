import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'c:\Users\AkashK\Downloads\Earth-Watch\frontend\src\app\terrain\page.tsx'
lines = open(path, encoding='utf-8').readlines()

# Lines 324-336 (1-indexed) = indices 323-335 (0-indexed)
# Replace the old Bhuvan setLulcResult block
new_block = [
    "        setLulcResult({\n",
    "          status: 'success',\n",
    "          bhuvan: true,\n",
    "          stats: {\n",
    "            source: `ISRO Bhuvan NRC LULC 250K (${bestYear}-${String(bestYear + 1).slice(-2)})`,\n",
    "            resolution: '250K scale',\n",
    "            year: bestYear,\n",
    "            season: 'annual',\n",
    "            total_area_km2: 'All India',\n",
    "            dominant_class: 'Visual Only (WMS)',\n",
    "            images_used: 'Pre-computed ISRO Dataset',\n",
    "            class_areas_km2: {},\n",
    "            class_percentages: {},\n",
    "          },\n",
    "        });\n",
]

# Verify the block we're replacing
print("BEFORE:")
for i, l in enumerate(lines[323:336], start=324):
    print(f"  {i}: {repr(l)}")

lines[323:336] = new_block

print("\nAFTER:")
for i, l in enumerate(lines[323:338], start=324):
    print(f"  {i}: {repr(l)}")

open(path, 'w', encoding='utf-8').writelines(lines)
print("\nOK: file written")
