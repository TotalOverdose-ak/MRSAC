import os
import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv1D, MaxPooling1D, Flatten, Dense, Dropout
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from tensorflow.keras.utils import to_categorical

# Config — Structured data directory
LULC_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'training_data', 'lulc_training_data')
CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'training_data', 'lulc_training_data', 'samples', 'lulc_samples.csv')
MODEL_SAVE_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend', 'ml_models', 'lulc_custom_model.h5')
CLASSES_SAVE_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend', 'ml_models', 'lulc_classes.npy')

def train_lulc_model():
    print(f"Loading dataset from: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)
    
    # Drop rows with missing values
    df = df.dropna()

    # Features and labels
    # The CSV has columns: B4,B3,B2,B8,B11,B12,NDVI,NDBI,MNDWI,NDSLI,class,sample
    feature_cols = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'NDVI', 'NDBI', 'MNDWI', 'NDSLI']
    
    # Reorder DataFrame to make sure features match exactly the expected order
    # Using the standard optical order (Blue, Green, Red, NIR, SWIR1, SWIR2 + indices)
    X = df[feature_cols].values
    y = df['class'].values

    print(f"Dataset Shape: {X.shape}")

    # Encode labels (Assuming classes 1 to 7 or similar)
    encoder = LabelEncoder()
    y_encoded = encoder.fit_transform(y)
    num_classes = len(np.unique(y_encoded))
    y_categorical = to_categorical(y_encoded)

    print(f"Detected {num_classes} land cover classes: {encoder.classes_}")

    # Split dataset
    X_train, X_test, y_train, y_test = train_test_split(X, y_categorical, test_size=0.2, random_state=42)

    # Reshape for 1D-CNN
    # (samples, timesteps/features, input_dim/channels)
    X_train = X_train.reshape((X_train.shape[0], X_train.shape[1], 1))
    X_test = X_test.reshape((X_test.shape[0], X_test.shape[1], 1))

    # Define 1D-CNN Model Architecture
    model = Sequential([
        Conv1D(filters=32, kernel_size=2, activation='relu', input_shape=(X_train.shape[1], 1)),
        MaxPooling1D(pool_size=2),
        Conv1D(filters=64, kernel_size=2, activation='relu'),
        MaxPooling1D(pool_size=2),
        Flatten(),
        Dense(128, activation='relu'),
        Dropout(0.3),
        Dense(64, activation='relu'),
        Dense(num_classes, activation='softmax')
    ])

    model.compile(optimizer='adam',
                  loss='categorical_crossentropy',
                  metrics=['accuracy'])

    model.summary()

    print("Starting training...")
    history = model.fit(X_train, y_train, epochs=50, batch_size=32, validation_data=(X_test, y_test), verbose=1)

    loss, accuracy = model.evaluate(X_test, y_test, verbose=0)
    print(f"\nFinal Test Accuracy: {accuracy*100:.2f}%")

    model.save(MODEL_SAVE_PATH)
    print(f"Model saved successfully to {MODEL_SAVE_PATH}")
    
    # Save the label encoder classes to know the mapping during inference
    np.save(CLASSES_SAVE_PATH, encoder.classes_)
    print(f"Label encoder classes saved to {CLASSES_SAVE_PATH}")

if __name__ == "__main__":
    train_lulc_model()
