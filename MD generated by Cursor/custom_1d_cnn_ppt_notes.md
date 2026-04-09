# Earth Watch: Custom 1D-CNN LULC Model (Deep Dive)

If the judges or professors ask *“Tell me exactly how you built your own custom AI model instead of just using Google’s API,”* this is exactly what you tell them.

We didn't just use standard image classification. We built a highly specific **1-Dimensional Convolutional Neural Network (1D-CNN)** using TensorFlow and Keras.

Here is exactly what we did inside the custom model ([lulc_trainer.py](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/lulc_trainer.py)):

---

## 1. The Data Preparation (Features & Labels)
Before feeding data to an AI, we must engineer the features mathematically. For every single pixel of land on earth, we extract **10 distinct scientific features** (The "X" variables).

*   **6 Optical Satellite Bands:** We use Sentinel-2’s Blue (`B2`), Green (`B3`), Red (`B4`), Near-Infrared (`B8`), and Shortwave Infrared bands (`B11`, `B12`).
*   **4 Calculated Spectral Indices:** We don't just rely on raw light. We calculate complex geospatial formulas to help the AI learn faster:
    1.  `NDVI` (Vegetation Index)
    2.  `NDBI` (Built-Up / Urban Index)
    3.  `MNDWI` (Water Index)
    4.  `NDSLI` (Soil / Salinity Index)

**The Labels (The "Y" target):**
We use `LabelEncoder` to convert physical text labels (like "Water", "Trees", "Built Area") into numbers from 0 to 8, representing our 9 land classes. We then use `to_categorical` to convert these numbers into "One-Hot Vectors" (arrays of zeros and ones), which neural networks understand much better.

**The Split:**
We use `train_test_split` to divide our dataset: **80% for training the brain**, and **20% strictly for testing** to ensure the AI isn't just memorizing the answers.

---

## 2. The 1D-CNN Architecture (The Layers)

Why a 1D-CNN instead of a 2D-CNN?
Normal image AI (2D) looks at the shape of an object in a picture (like the shape of a house). But satellites are so high up that a pixel is just a single dot of light. Our 1D-CNN looks at the **"Spectral Signature"**—the sequence of the 10 light features bouncing off that one dot—to figure out what the material is.

Here is the exact Neural Network layer logic:

1.  **`Input Layer`:** Reshapes the data so the AI reads the 10 features sequentially [(samples, 10, 1)](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/mine_detection.py#392-530).
2.  **`Conv1D (32 Filters)` & `MaxPooling1D (Pool Size 2)`:** The first Convolutional layer slides over the data and extracts basic spectral relationships. The pooling layer downsamples it to save computer memory.
3.  **`Conv1D (64 Filters)` & `MaxPooling1D`:** A deeper layer that extracts complex, hidden signatures (e.g., distinguishing between dry dirt and concrete).
4.  **`Flatten Layer`:** Flattens the 1D arrays into a single straight line of neurons.
5.  **`Dense Layer (128 Neurons)`:** A massive fully-connected layer that begins making the final decisions.
6.  **`Dropout (0.3)`:** Extremely important! We randomly "turn off" 30% of the neurons during training. This forces the AI to learn the *true* underlying patterns instead of just blindly memorizing the training data (preventing "Overfitting").
7.  **`Dense Layer (64 Neurons)`:** A final refinement layer.
8.  **`Output Dense Layer (9 Neurons)`:** Features a **`Softmax`** activation function. It outputs 9 numbers (percentages) that all add up to 100%. If Neuron #6 says 98%, the model is 98% confident the pixel is a "Built Area".

---

## 3. Training the Brain (Compilation & Execution)

*   **The Optimizer:** **`Adam`** (Adaptive Moment Estimation). It mathematically speeds up the training process by dynamically adjusting the learning rate.
*   **The Loss Function:** **`Categorical Crossentropy`**. This calculates how "wrong" the AI is. If the AI guesses "Water" but the answer is "Trees", the loss spikes, forcing the Adam optimizer to change the neural weights.
*   **The Execution:** We train the model for **`50 Epochs`** (it reads the entire dataset 50 times over) using a **`Batch Size of 32`** (updating its brain after every 32 pixels it reads).

---

## 4. Inference in the Backend (How it actually runs)

When a user clicks "Detect" using our custom model:
1.  The FastAPI backend uses Google Earth Engine to download the pure raw matrix of the 10 calculated features.
2.  It uses `reshape` to flatten millions of pixels into a massive 1D array list.
3.  It passes this massive list into our trained [.h5](file:///c:/Users/AkashK/Downloads/New%20folder%20%282%29/Earth-Watch/lulc_custom_model.h5) model file using `model.predict(batch_size=2048)` to process thousands of pixels simultaneously.
4.  It uses `np.argmax()` to find the highest probability class for every single pixel.
5.  It mathematically reconstructs the 2D image, applies our custom Hex colors using `Matplotlib`, encodes the transparent image into `Base64`, and sends it purely as text to the Next.js frontend to instantly render on the user's map!
