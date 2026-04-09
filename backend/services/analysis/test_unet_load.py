import os
import tensorflow as tf
from backend.services.analysis.unet import UNet

model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'new features', 'refrence', 'landslide4sense-solution-main', 'model', 'best_model.h5'))

print("Loading UNet architecture...")

try:
    # Based on the Landslide4Sense defaults we need to figure out kwargs
    # The output is 1 for binary classification (landslide or non-landslide mask)
    # The input shape is 128x128x14
    model = UNet(
        length=128, width=128, model_depth=5, num_channel=14, model_width=64,
        kernel_size=3, problem_type='Classification', output_nums=2,
        ds=1, ae=0, ag=1, lstm=1, is_transconv=True
    ).UNet()
    
    print("Loading weights...")
    model.load_weights(model_path)
    print("SUCCESS: Weights loaded into custom UNet architecture!")
except Exception as e:
    print("FAILED:", str(e))
