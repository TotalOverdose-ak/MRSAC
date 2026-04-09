import os
import tensorflow as tf

model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'new features', 'refrence', 'landslide4sense-solution-main', 'model', 'best_model.h5'))

print("Loading model from:", model_path)

try:
    # Try compiling False first
    model = tf.keras.models.load_model(model_path, compile=False)
    print("SUCCESS: Model loaded with compile=False!")
    print("Expected input shape:", model.input_shape)
    print("Expected output shape:", model.output_shape)
except Exception as e:
    print("FAILED to load model:", str(e))
