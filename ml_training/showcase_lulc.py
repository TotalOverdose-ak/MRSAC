import rasterio
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
import os

# Standard LULC Colors (Dynamic World equivalent mapping)
colors = [
    '#419BDF', # 0: Water (Blue)
    '#397D49', # 1: Trees (Dark Green)
    '#88B053', # 2: Grass (Light Green)
    '#7A87C6', # 3: Flooded vegetation (Purple)
    '#E49635', # 4: Crops (Orange)
    '#DFC35A', # 5: Shrub & Scrub (Olive/Yellow)
    '#C4281B', # 6: Built Area (Red)
    '#A59B8F', # 7: Bare ground (Grey)
    '#B39FE1'  # 8: Snow & Ice (Light Purple)
]
# Create colormap dynamically based on max class found in image if needed,
# but using a fixed 0-8 map is standard.
cmap = ListedColormap(colors)

def generate_showcase():
    tif_path = 'lulc_custom_output.tif'
    if not os.path.exists(tif_path):
        print(f"Error: Could not find {tif_path}. Please run Custom LULC inference first.")
        return

    print("Loading custom 1D-CNN result...")
    with rasterio.open(tif_path) as src:
        img = src.read(1)
        
    plt.figure(figsize=(10, 10))
    # We clip between 0 and 8 to match the colorbar
    plt.imshow(img, cmap=cmap, vmin=0, vmax=8)
    plt.axis('off')
    
    # Optional legend or title
    plt.title('Earth-Watch: Custom 1D-CNN LULC Map', fontsize=18, pad=20)
    
    output_png = 'lulc_custom_showcase.png'
    plt.savefig(output_png, bbox_inches='tight', pad_inches=0.1, dpi=300, facecolor='black')
    print(f"Success! Beautiful presentation map saved as: {output_png}")
    
    # Automatically try to open it for the user
    try:
        os.startfile(output_png)
    except Exception:
        pass

if __name__ == "__main__":
    generate_showcase()
