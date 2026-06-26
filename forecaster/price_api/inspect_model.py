# inspect_model.py
# Run this once: python inspect_model.py
# Dumps everything your pkl files know about the model

import joblib
import numpy as np
import json

MODEL_PATH      = "artifacts/random_forest_price_model.pkl"
ENCODER_PATH    = "artifacts/label_encoders.pkl"
FEATURES_PATH   = "artifacts/feature_columns.pkl"
PREPROCESS_PATH = "artifacts/preprocessing_info.pkl"

model          = joblib.load(MODEL_PATH)
label_encoders = joblib.load(ENCODER_PATH)
feature_cols   = joblib.load(FEATURES_PATH)
preprocess     = joblib.load(PREPROCESS_PATH)

SEP = "─" * 55

# ── 1. Feature columns (training order) ──────────────────────
print(SEP)
print("FEATURE COLUMNS (exact training order)")
print(SEP)
for i, col in enumerate(feature_cols):
    print(f"  [{i:02d}] {col}")

# ── 2. Preprocessing info ─────────────────────────────────────
print(f"\n{SEP}")
print("PREPROCESSING INFO")
print(SEP)
if isinstance(preprocess, dict):
    for k, v in preprocess.items():
        print(f"  {k}: {v}")
else:
    print(f"  Type: {type(preprocess)}")
    print(f"  Value: {preprocess}")

# ── 3. Label encoders — what categories exist per column ─────
print(f"\n{SEP}")
print("LABEL ENCODERS — valid categories per column")
print(SEP)
for col, enc in label_encoders.items():
    classes = list(enc.classes_)
    print(f"\n  {col} ({len(classes)} classes):")
    for cls in classes:
        print(f"    • {cls}  →  {enc.transform([cls])[0]}")

# ── 4. RF model parameters ────────────────────────────────────
print(f"\n{SEP}")
print("RANDOM FOREST PARAMETERS")
print(SEP)
params = model.get_params()
for k, v in params.items():
    print(f"  {k}: {v}")

# ── 5. Feature importances ────────────────────────────────────
print(f"\n{SEP}")
print("FEATURE IMPORTANCES (from RF, sorted)")
print(SEP)
importances = model.feature_importances_
ranked = sorted(zip(feature_cols, importances), key=lambda x: x[1], reverse=True)
for col, imp in ranked:
    bar = "█" * int(imp * 40)
    print(f"  {col:<30} {imp:.4f}  {bar}")

# ── 6. Tree depth / structure ─────────────────────────────────
print(f"\n{SEP}")
print("MODEL STRUCTURE")
print(SEP)
depths = [t.get_depth() for t in model.estimators_]
leaves = [t.get_n_leaves() for t in model.estimators_]
print(f"  n_estimators : {len(model.estimators_)}")
print(f"  avg tree depth: {np.mean(depths):.1f}  (min {min(depths)}, max {max(depths)})")
print(f"  avg leaves    : {np.mean(leaves):.1f}")
print(f"  n_features_in : {model.n_features_in_}")

# ── 7. Quick sanity prediction ────────────────────────────────
print(f"\n{SEP}")
print("SANITY CHECK — dummy prediction with zeros")
print(SEP)
try:
    dummy = np.zeros((1, len(feature_cols)))
    pred  = model.predict(dummy)[0]
    print(f"  Prediction on zero vector: {pred:.2f}")
    print("  (If this looks like your average crop price, model loaded fine)")
except Exception as e:
    print(f"  ERROR: {e}")

print(f"\n{SEP}")
print("Done. Paste output here if you need help reading it.")
print(SEP)