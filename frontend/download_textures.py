import os
import urllib.request

os.makedirs('public/textures/planets', exist_ok=True)

urls = [
    'https://www.solarsystemscope.com/textures/download/2k_sun.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg',
    'https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png'
]

for url in urls:
    filename = url.split('/')[-1]
    save_path = f'public/textures/planets/{filename}'
    print(f"Downloading {filename}...")
    try:
        urllib.request.urlretrieve(url, save_path)
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

print("Done downloading textures.")
