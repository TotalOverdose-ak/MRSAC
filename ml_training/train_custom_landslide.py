import os
import numpy as np
import h5py
import tensorflow as tf
from tensorflow.keras import backend as K
from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, UpSampling2D, concatenate, Dropout
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping

# ================================
# Custom Metrics
# ================================
def recall_m(y_true, y_pred):
    true_positives = K.sum(K.round(K.clip(y_true * y_pred, 0, 1)))
    possible_positives = K.sum(K.round(K.clip(y_true, 0, 1)))
    recall = true_positives / (possible_positives + K.epsilon())
    return recall

def precision_m(y_true, y_pred):
    true_positives = K.sum(K.round(K.clip(y_true * y_pred, 0, 1)))
    predicted_positives = K.sum(K.round(K.clip(y_pred, 0, 1)))
    precision = true_positives / (predicted_positives + K.epsilon())
    return precision

def f1_m(y_true, y_pred):
    precision = precision_m(y_true, y_pred)
    recall = recall_m(y_true, y_pred)
    return 2*((precision*recall)/(precision+recall+K.epsilon()))

# ================================
# U-Net Architecture
# ================================
def build_unet(img_width=128, img_height=128, img_channels=6):
    """
    U-Net specifically configured for Earth-Watch (128x128x6).
    Input features: RED, GREEN, BLUE, NDVI, SLOPE, ELEVATION
    Output: Softmax on 2 classes (Non-Landslide: 0, Landslide: 1)
    """
    inputs = Input((img_width, img_height, img_channels))

    c1 = Conv2D(16, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(inputs)
    c1 = Dropout(0.1)(c1)
    c1 = Conv2D(16, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c1)
    p1 = MaxPooling2D((2, 2))(c1)

    c2 = Conv2D(32, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(p1)
    c2 = Dropout(0.1)(c2)
    c2 = Conv2D(32, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c2)
    p2 = MaxPooling2D((2, 2))(c2)
     
    c3 = Conv2D(64, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(p2)
    c3 = Dropout(0.2)(c3)
    c3 = Conv2D(64, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c3)
    p3 = MaxPooling2D((2, 2))(c3)
     
    c4 = Conv2D(128, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(p3)
    c4 = Dropout(0.2)(c4)
    c4 = Conv2D(128, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c4)
    p4 = MaxPooling2D(pool_size=(2, 2))(c4)
     
    c5 = Conv2D(256, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(p4)
    c5 = Dropout(0.3)(c5)
    c5 = Conv2D(256, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c5)

    u6 = UpSampling2D((2, 2))(c5)
    u6 = concatenate([u6, c4])
    c6 = Conv2D(128, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(u6)
    c6 = Dropout(0.2)(c6)
    c6 = Conv2D(128, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c6)
     
    u7 = UpSampling2D((2, 2))(c6)
    u7 = concatenate([u7, c3])
    c7 = Conv2D(64, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(u7)
    c7 = Dropout(0.2)(c7)
    c7 = Conv2D(64, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c7)
     
    u8 = UpSampling2D((2, 2))(c7)
    u8 = concatenate([u8, c2])
    c8 = Conv2D(32, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(u8)
    c8 = Dropout(0.1)(c8)
    c8 = Conv2D(32, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c8)
     
    u9 = UpSampling2D((2, 2))(c8)
    u9 = concatenate([u9, c1], axis=3)
    c9 = Conv2D(16, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(u9)
    c9 = Dropout(0.1)(c9)
    c9 = Conv2D(16, (3, 3), activation='relu', kernel_initializer='he_normal', padding='same')(c9)
     
    outputs = Conv2D(2, (1, 1), activation='softmax')(c9)
     
    model = tf.keras.Model(inputs=[inputs], outputs=[outputs])
    model.compile(
        optimizer='adam', 
        loss='sparse_categorical_crossentropy', 
        metrics=['accuracy', f1_m, precision_m, recall_m]
    )
    return model

# ================================
# Data Loading
# ================================
def load_data():
    """
    Loads real training patches from landslide_training_data/processed/.
    Each patch is a 128x128 tile with 6 feature channels (RED, GREEN, BLUE, NDVI, SLOPE, ELEVATION).
    Labels are binary masks (0 = Non-Landslide, 1 = Landslide).
    Falls back to augmented dummy data if no real patches are found.
    """
    print("Loading datasets...")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    proc_dir = os.path.join(script_dir, '..', 'data', 'training_data', 'landslide_training_data', 'processed')

    X_all, y_all = [], []
    if os.path.isdir(proc_dir):
        for fname in sorted(os.listdir(proc_dir)):
            if not fname.endswith('_X.npy'):
                continue
            base = fname.replace('_X.npy', '')
            xp = os.path.join(proc_dir, fname)
            yp = os.path.join(proc_dir, f"{base}_y.npy")
            if os.path.exists(yp):
                x_patch = np.load(xp)   # (128, 128, 6)
                y_patch = np.load(yp)   # (128, 128)
                X_all.append(x_patch)
                y_all.append(y_patch)
                print(f"  Loaded: {base}  — risk pixels: {int(y_patch.sum())}/16384")

    if len(X_all) == 0:
        raise ValueError("No actual landslide training data found in 'landslide_training_data/processed/'! Please process it using the GEE backend first. Aborting.")
    else:
        X_all_arr = np.array(X_all, dtype=np.float32)
        y_all_arr = np.array(y_all, dtype=np.int32)  # (N, 128, 128) — sparse_categorical labels

    # Augment by flipping to increase effective dataset size
    X_aug = np.concatenate([X_all_arr,
                            X_all_arr[:, :, ::-1, :],   # horizontal flip
                            X_all_arr[:, ::-1, :, :]])  # vertical flip
    y_aug = np.concatenate([y_all_arr,
                            y_all_arr[:, :, ::-1],
                            y_all_arr[:, ::-1, :]])

    # Shuffle
    idx = np.random.permutation(len(X_aug))
    X_aug, y_aug = X_aug[idx], y_aug[idx]

    split = max(1, int(len(X_aug) * 0.8))
    X_train, y_train = X_aug[:split], y_aug[:split]
    X_val,   y_val   = X_aug[split:], y_aug[split:]

    print(f"  Train: {X_train.shape}, Val: {X_val.shape}")
    print(f"  Label range: {y_train.min()} – {y_train.max()}")
    return X_train, y_train, X_val, y_val

# ================================
# Training Logic
# ================================
if __name__ == '__main__':
    print("Building 6-band U-Net Earth-Watch Landslide Model...")
    model = build_unet(128, 128, 6)
    
    # Print model summary
    model.summary()

    # Load data
    X_train, y_train, X_val, y_val = load_data()

    # Define callbacks
    checkpoint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "ml_models", "custom_landslide_best.h5")
    checkpoint = ModelCheckpoint(
        checkpoint_path,
        monitor="val_loss",
        verbose=1,
        save_best_only=True,
        mode="min"
    )
    early_stop = EarlyStopping(
        monitor='val_loss',
        patience=15,
        verbose=1,
        restore_best_weights=True
    )

    print("Starting training...")
    try:
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            batch_size=4,
            epochs=60,
            callbacks=[checkpoint, early_stop],
            verbose=1
        )
        print("Training finished successfully. Model saved to 'custom_landslide_best.h5'.")
    except Exception as e:
        print(f"Error during training: {e}")
