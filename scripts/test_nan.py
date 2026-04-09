import json
import numpy as np
from backend.services.analysis.dl_landslide import train_landslide_distill
with open("sample_geom.json") as f:
    geom = json.load(f)

# we will just hook into the shape
