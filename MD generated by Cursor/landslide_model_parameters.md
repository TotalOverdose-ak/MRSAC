# Earth Watch: Landslide U-Net Hyperparameters & Technical Specs

If the judges press you on the **exact mathematical and structural parameters** of your Landslide Susceptibility Deep Learning model, use this technical cheat-sheet. This covers everything inside [train_custom_landslide.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/train_custom_landslide.py).

---

## 1. Input & Output Parameters
*   **Input Shape:** [(128, 128, 6)](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#395-396)
    *   **Patch Size:** `128 x 128` pixels per training tile.
    *   **6 Feature Channels:** (Red, Green, Blue, NDVI, Slope, Elevation).
*   **Output Shape:** [(128, 128, 2)](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#395-396) 
    *   Outputs a strict binary prediction per pixel: `0` (Non-Landslide) or `1` (Landslide).

## 2. The U-Net Architectural Parameters
We built a custom U-Net with specific filter depths and dropouts to handle topographically noisy data.

### The Encoder (Downsampling Path)
*   **Layer 1:** 2x `Conv2D(16 filters, 3x3 kernel)` | Activation: `ReLU` | Init: `he_normal` | `Dropout(0.1)` | `MaxPooling2D(2,2)`
*   **Layer 2:** 2x `Conv2D(32 filters, 3x3 kernel)` | Activation: `ReLU` | Init: `he_normal` | `Dropout(0.1)` | `MaxPooling2D(2,2)`
*   **Layer 3:** 2x `Conv2D(64 filters, 3x3 kernel)` | Activation: `ReLU` | Init: `he_normal` | `Dropout(0.2)` | `MaxPooling2D(2,2)`
*   **Layer 4:** 2x `Conv2D(128 filters, 3x3 kernel)` | Activation: `ReLU` | Init: `he_normal` | `Dropout(0.2)` | `MaxPooling2D(2,2)`

### The Bottleneck
*   **Layer 5 (Deepest):** 2x `Conv2D(256 filters, 3x3 kernel)` | Activation: `ReLU` | `Dropout(0.3)`

### The Decoder (Upsampling Path)
*   **Layer 6:** `UpSampling2D(2,2)` | Concatenate with Layer 4 | 2x `Conv2D(128)` | `Dropout(0.2)`
*   **Layer 7:** `UpSampling2D(2,2)` | Concatenate with Layer 3 | 2x `Conv2D(64)` | `Dropout(0.2)`
*   **Layer 8:** `UpSampling2D(2,2)` | Concatenate with Layer 2 | 2x `Conv2D(32)` | `Dropout(0.1)`
*   **Layer 9:** `UpSampling2D(2,2)` | Concatenate with Layer 1 | 2x `Conv2D(16)` | `Dropout(0.1)`

### The Final Output Head
*   **Layer 10:** `Conv2D(2 filters, 1x1 kernel)` | Activation: **`Softmax`**
    *   *(Note: Softmax is used here because we are classifying into exactly 2 mutually exclusive probability buckets: True or False)*

---

## 3. Compilation & Optimizer Parameters
*   **Optimizer:** `Adam` (Adaptive Moment Estimation) 
    *   *Why?* It automatically tunes the learning rate during training, preventing the model from getting stuck in local minimums.
*   **Loss Function:** `sparse_categorical_crossentropy`
    *   *Why?* Because our labels are integers (`0` or `1`) rather than heavy one-hot encoded vectors, this specific loss function saves massive amounts of GPU memory.
*   **Custom Metrics Tracked:**
    *   `accuracy`
    *   [f1_m](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/train_custom_landslide.py#24-28) (F1-Score: Harmonic mean of precision and recall)
    *   [precision_m](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/train_custom_landslide.py#18-23) (How many predicted landslides were actually landslides constraints false alarms)
    *   [recall_m](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/train_custom_landslide.py#12-17) (How many real-world landslides did the model successfully find)

---

## 4. Execution & Training Pipeline Parameters
*   **Data Augmentation:** The arrays are multiplied by 3x using `horizontal` and `vertical` flipping (`numpy[::-1]`) to prevent overfitting on the limited topographical dataset.
*   **Epochs:** `60` (Maximum hard limit).
*   **Batch Size:** `4`
    *   *Why so small?* 6-Channel topographical 128x128 matrices are computationally heavy. A batch size of 4 prevents Out-Of-Memory (OOM) crashes while dynamically mapping mountain ranges.
*   **Validation Split:** `80% Train / 20% Validate`.
*   **Patience / Early Stopping:** `patience=15`.
    *   The model watches the `val_loss`. If the AI fails to improve its accuracy for 15 epochs in a row, the training automatically aborts, and `restore_best_weights=True` ensures we only save the smartest version of the brain!
