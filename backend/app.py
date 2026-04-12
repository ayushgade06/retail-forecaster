import os
import logging
import pandas as pd
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

@app.route('/predict', methods=['POST'])
def predict():
    """Generate demand forecast"""
    if forecast_model is None:
        return jsonify({'error': 'Forecast model not initialized.'}), 503
        
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is empty"}), 400
        
    required_fields = ['category', 'product', 'date', 'weather']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: '{field}'"}), 400

    result = forecast_model.predict(
        category=data['category'],
        product=data['product'],
        date_str=data['date'],
        weather=data['weather']
    )
    
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