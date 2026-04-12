import logging
import joblib
import numpy as np
import pandas as pd
from datetime import datetime

logger = logging.getLogger(__name__)

class ForecastModel:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self._load_model()

        # The feature names as expected by the joblib model
        self.feature_names = [
            'stock', 'day_of_week', 'week_of_year', 'month', 'is_weekend', 'is_festival',
            'item_name_Biscuits', 'item_name_Bread', 'item_name_Chips',
            'item_name_Jeans', 'item_name_Laptop', 'item_name_Milk',
            'item_name_Smartphone', 'item_name_T-shirt', 'item_type_Clothing',
            'item_type_Electronics', 'item_type_Grocery', 'item_type_Packaged Food',
            'weather_Cloudy', 'weather_Heatwave', 'weather_Rainy', 'weather_Storm',
            'weather_Sunny', 'festival_electronics', 'storm_grocery'
        ]

    def _load_model(self):
        try:
            logger.info(f"Loading model from {self.model_path}")
            self.model = joblib.load(self.model_path)
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise

    def predict(self, category: str, product: str, date_str: str, weather: str) -> dict:
        try:
            if self.model is None:
                return {"error": "Model not loaded"}

            # Parse date
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            day_of_week = dt.weekday()
            week_of_year = dt.isocalendar()[1]
            month = dt.month
            is_weekend = 1 if day_of_week >= 5 else 0
            is_festival = 1 if month == 12 else 0  # Heuristic

            # Weather is already provided
            weather = weather

            # Build features dictionary initialized to 0
            feature_dict = {f: 0 for f in self.feature_names}
            
            # Stock assumption
            feature_dict['stock'] = 50 

            feature_dict['day_of_week'] = day_of_week
            feature_dict['week_of_year'] = week_of_year
            feature_dict['month'] = month
            feature_dict['is_weekend'] = is_weekend
            feature_dict['is_festival'] = is_festival

            # One-hot encoding
            item_name_key = f"item_name_{product}"
            if item_name_key in feature_dict:
                feature_dict[item_name_key] = 1

            item_type_key = f"item_type_{category}"
            if item_type_key in feature_dict:
                feature_dict[item_type_key] = 1

            weather_key = f"weather_{weather}"
            if weather_key in feature_dict:
                feature_dict[weather_key] = 1

            # Interactions
            if is_festival == 1 and category == "Electronics":
                feature_dict['festival_electronics'] = 1
            if weather == "Storm" and category == "Grocery":
                feature_dict['storm_grocery'] = 1

            # Convert to Dataframe for prediction (since XGBoost requires feature names)
            input_df = pd.DataFrame([feature_dict])

            prediction = self.model.predict(input_df)[0]

            return {
                "predicted_demand": round(float(prediction), 2)
            }
        except Exception as e:
            logger.error(f"Prediction error: {str(e)}")
            return {
                "error": str(e)
            }