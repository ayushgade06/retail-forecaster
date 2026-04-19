import os
import logging
import pandas as pd
import requests
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from model import ForecastModel
from config import Config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS for frontend
CORS(app)

# Initialize forecast model
try:
    forecast_model = ForecastModel(model_path=app.config['MODEL_PATH'])
    logger.info("Forecast model initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize forecast model: {str(e)}")
    forecast_model = None

# Load dataset for categories and products
try:
    df = pd.read_csv(app.config['DATA_PATH'])
    # Standardize dates globally
    df['date'] = pd.to_datetime(df['date'], dayfirst=True, errors='coerce')
    df = df.dropna(subset=['date'])
    logger.info(f"Loaded {len(df)} records. Date range: {df['date'].min()} to {df['date'].max()}")
    # Extract unique categories and their corresponding products
    CATEGORIES = sorted(df['item_type'].dropna().unique().tolist())
    PRODUCTS_BY_CATEGORY = {}
    for cat in CATEGORIES:
        prods = sorted(df[df['item_type'] == cat]['item_name'].dropna().unique().tolist())
        PRODUCTS_BY_CATEGORY[cat] = prods
    logger.info("Data loaded for categories and products")
except Exception as e:
    logger.error(f"Failed to load data for categories/products: {str(e)}")
    CATEGORIES = []
    PRODUCTS_BY_CATEGORY = {}


@app.route('/categories', methods=['GET'])
def get_categories():
    """Return list of categories"""
    return jsonify({
        "categories": CATEGORIES
    }), 200

@app.route('/products', methods=['GET'])
def get_products():
    """Return products filtered by category"""
    category = request.args.get('category')
    if not category:
        return jsonify({"error": "Category query parameter is required"}), 400
    
    products = PRODUCTS_BY_CATEGORY.get(category, [])
    return jsonify({
        "products": products
    }), 200

def get_weather_forecast(location: str, date_str: str):
    api_key = app.config.get('OPENWEATHER_API_KEY')
    if not api_key:
        logger.warning("OPENWEATHER_API_KEY is not set. Defaulting weather to Sunny.")
        return "Sunny"

    try:
        # Lowercase for URL compatibility
        clean_location = location.strip().lower()
        # Get coordinates for location
        geo_url = f"http://api.openweathermap.org/geo/1.0/direct?q={clean_location}&limit=1&appid={api_key}"
        geo_res = requests.get(geo_url)
        geo_data = geo_res.json()
        if not geo_data:
            raise ValueError(f"Location not found: {location}")
            
        lat = geo_data[0]['lat']
        lon = geo_data[0]['lon']
        
        # Get forecast
        forecast_url = f"http://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={api_key}&units=metric"
        forecast_res = requests.get(forecast_url)
        forecast_data = forecast_res.json()
        
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        
        # Find forecast closest to noon on target date
        selected_forecast = None
        for item in forecast_data.get('list', []):
            dt = datetime.fromtimestamp(item['dt'])
            if dt.date() == target_date:
                selected_forecast = item
                if dt.hour >= 12: # Prefer midday approx
                    break
                    
        if not selected_forecast:
            # If target date out of 5-day range, pick the last available
            if forecast_data.get('list'):
                selected_forecast = forecast_data['list'][-1]
            else:
                return "Sunny"
                
        temp = selected_forecast['main']['temp']
        weather_main = selected_forecast['weather'][0]['main']
        
        # Categorize appropriately to internal feature logic
        if temp >= 35:
            condition = "Heatwave"
        elif weather_main in ['Clear']:
            condition = "Sunny"
        elif weather_main in ['Rain', 'Drizzle', 'Snow']:
            condition = "Rainy"
        elif weather_main in ['Thunderstorm', 'Tornado', 'Squall']:
            condition = "Storm"
        else:
            condition = "Cloudy"
            
        return condition
        
    except Exception as e:
        logger.error(f"Error fetching weather: {e}")
        return "Sunny"


@app.route('/history', methods=['GET'])
def get_history():
    """Return historical sales for a product from the dataset"""
    product = request.args.get('product')
    if not product:
        return jsonify({"error": "Product parameter is required"}), 400
    
    try:
        # Filter for product
        product_df = df[df['item_name'] == product].copy()
        if product_df.empty:
             return jsonify({"history": []}), 200

        # Ensure date is datetime - handle potential DD-MM-YYYY or YYYY-MM-DD mixed formats
        product_df['date'] = pd.to_datetime(product_df['date'], dayfirst=True, errors='coerce')
        product_df = product_df.dropna(subset=['date'])
        
        # Get the 7 most recent records
        recent = product_df.sort_values('date', ascending=False).head(7)
        # Sort back to chronological for chart
        recent = recent.sort_values('date')
        
        history = [
            {
                "date": row['date'].strftime('%Y-%m-%d'),
                "demand": int(row['sold_quantity'])
            } for _, row in recent.iterrows()
        ]
        
        return jsonify({"history": history}), 200
    except Exception as e:
        logger.error(f"History error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/predict', methods=['POST'])
def predict():
    """Generate demand forecast"""
    if forecast_model is None:
        return jsonify({'error': 'Forecast model not initialized.'}), 503
        
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is empty"}), 400
        
    required_fields = ['category', 'product', 'date', 'location']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: '{field}'"}), 400

    try:
        weather_condition = get_weather_forecast(data['location'], data['date'])
    except Exception as e:
         return jsonify({"error": str(e)}), 400

    result = forecast_model.predict(
        category=data['category'],
        product=data['product'],
        date_str=data['date'],
        weather=weather_condition
    )
    
    if 'error' not in result:
        result['weather_condition'] = weather_condition
        
    if 'error' in result:
        return jsonify(result), 500
        
    return jsonify(result), 200

if __name__ == '__main__':
    logger.info("Starting Retail Demand Forecasting API...")
    app.run(
        host=app.config['HOST'],
        port=app.config['PORT'],
        debug=app.config['DEBUG']
    )