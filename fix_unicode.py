import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'c:\Users\AkashK\Downloads\Earth-Watch\frontend\src\components\LulcReport.tsx'
t = open(path, encoding='utf-8').read()

# Fix escaped unicode sequences that should be actual characters
fixes = [
    ('Area Distribution \\\\u2014', 'Area Distribution \u2014'),
    ('Add 2\\\\u20134', 'Add 2\u20134'),
    ('Change Summary ({multiYearData[0].year} \\\\u2192 {multiYearData[multiYearData.length - 1].year})', 'Change Summary ({multiYearData[0].year} \u2192 {multiYearData[multiYearData.length - 1].year})'),
    ("'ISRO NRSC Bhuvan \\\\u00B7 250K \\\\u00B7 WMS'", "'ISRO NRSC Bhuvan \u00b7 250K \u00b7 WMS'"),
    ("'Sentinel-2 \\\\u00B7 10m \\\\u00B7 Google Dynamic World V1'", "'Sentinel-2 \u00b7 10m \u00b7 Google Dynamic World V1'"),
    ('${totalArea.toFixed(2)} km\\\\u00B2', '${totalArea.toFixed(2)} km\u00b2'),
]

count = 0
for old, new in fixes:
    if old in t:
        t = t.replace(old, new)
        count += 1
        print(f'Fixed: {repr(old[:40])}')

open(path, 'w', encoding='utf-8').write(t)
print(f'\nDone: {count} fixes applied')
