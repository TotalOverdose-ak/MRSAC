import os
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, UpSampling2D, concatenate, Dropout, BatchNormalization, Activation
from tensorflow.keras.optimizers import Adam
import numpy as np

def conv2d_block(input_tensor, n_filters, kernel_size=3, batchnorm=True):
    """Function to add 2 convolutional layers with the parameters passed to it"""
    x = Conv2D(filters=n_filters, kernel_size=(kernel_size, kernel_size), kernel_initializer='he_normal', padding='same')(input_tensor)
    if batchnorm:
        x = BatchNormalization()(x)
    x = Activation('relu')(x)
    
    x = Conv2D(filters=n_filters, kernel_size=(kernel_size, kernel_size), kernel_initializer='he_normal', padding='same')(x)
    if batchnorm:
        x = BatchNormalization()(x)
    x = Activation('relu')(x)
    return x

def get_unet(input_img, n_filters=16, dropout=0.1, batchnorm=True):
    """Function to define the UNET Model"""
    # Contracting Path
    c1 = conv2d_block(input_img, n_filters * 1, kernel_size=3, batchnorm=batchnorm)
    p1 = MaxPooling2D((2, 2))(c1)
    p1 = Dropout(dropout)(p1)
    
    c2 = conv2d_block(p1, n_filters * 2, kernel_size=3, batchnorm=batchnorm)
    p2 = MaxPooling2D((2, 2))(c2)
    p2 = Dropout(dropout)(p2)
    
    c3 = conv2d_block(p2, n_filters * 4, kernel_size=3, batchnorm=batchnorm)
    p3 = MaxPooling2D((2, 2))(c3)
    p3 = Dropout(dropout)(p3)
    
    c4 = conv2d_block(p3, n_filters * 8, kernel_size=3, batchnorm=batchnorm)
    p4 = MaxPooling2D((2, 2))(c4)
    p4 = Dropout(dropout)(p4)
    
    c5 = conv2d_block(p4, n_filters=n_filters * 16, kernel_size=3, batchnorm=batchnorm)
    
    # Expansive Path
    u6 = UpSampling2D((2, 2))(c5)
    u6 = concatenate([u6, c4])
    u6 = Dropout(dropout)(u6)
    c6 = conv2d_block(u6, n_filters * 8, kernel_size=3, batchnorm=batchnorm)
    
    u7 = UpSampling2D((2, 2))(c6)
    u7 = concatenate([u7, c3])
    u7 = Dropout(dropout)(u7)
    c7 = conv2d_block(u7, n_filters * 4, kernel_size=3, batchnorm=batchnorm)
    
    u8 = UpSampling2D((2, 2))(c7)
    u8 = concatenate([u8, c2])
    u8 = Dropout(dropout)(u8)
    c8 = conv2d_block(u8, n_filters * 2, kernel_size=3, batchnorm=batchnorm)
    
    u9 = UpSampling2D((2, 2))(c8)
    u9 = concatenate([u9, c1])
    u9 = Dropout(dropout)(u9)
    c9 = conv2d_block(u9, n_filters * 1, kernel_size=3, batchnorm=batchnorm)
    
    outputs = Conv2D(1, (1, 1), activation='sigmoid')(c9)
    model = Model(inputs=[input_img], outputs=[outputs])
    return model

def load_gee_data():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "..", "data", "training_data", "building_training_data", "processed")
    X_list = []
    y_list = []
    
    if os.path.exists(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith("_X.npy"):
                base_name = f.replace("_X.npy", "")
                y_file = f"{base_name}_y.npy"
                if os.path.exists(os.path.join(data_dir, y_file)):
                    X_list.append(np.load(os.path.join(data_dir, f)))
                    y_list.append(np.load(os.path.join(data_dir, y_file)))

    if not X_list:
        raise ValueError("No actual building training data found in 'building_training_data/processed/'! Please process it using the GEE backend first. Aborting.")

    # Combine arrays
    X = np.concatenate(X_list, axis=0) if len(X_list) > 1 else X_list[0]
    y = np.concatenate(y_list, axis=0) if len(y_list) > 1 else y_list[0]
    
    # Ensure standard shape expectations (samples, 256, 256, channels)
    if len(X.shape) == 3: X = np.expand_dims(X, axis=0)
    if len(y.shape) == 3: y = np.expand_dims(y, axis=-1)

    # Normalize if it's 8-bit image data
    if X.max() > 1.0:
        X = X.astype(np.float32) / 255.0

    return X, y

if __name__ == '__main__':
    print("Initializing Custom Building Detection U-Net model...")

    dest_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "ml_models", "custom_building_best.h5")
    
    input_img = Input((256, 256, 3), name='img')
    model = get_unet(input_img, n_filters=16, dropout=0.05, batchnorm=True)
    model.compile(optimizer=Adam(learning_rate=1e-4), loss="binary_crossentropy", metrics=["accuracy"])
    
    print(model.summary())
    
    # 1. Force the model to load REAL data from GEE
    try:
        print("Loading real GEE training data...")
        X, y = load_gee_data()
        print(f"Loaded {len(X)} actual GEE patches for training.")
        
        # Train on real data
        print("Training base layer with real GEE data...")
        model.fit(X, y, epochs=10, batch_size=4, validation_split=0.2, verbose=1)
        
    except ValueError as e:
        print(f"CRITICAL ERROR: {e}")
        exit(1)
            
    # Save standard full model format
    model.save(dest_path)
    print(f"Model successfully trained and saved to: {dest_path}")
