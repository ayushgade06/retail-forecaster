import os

class Config:
    """Base configuration class."""
    DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    HOST = os.getenv("FLASK_HOST", "127.0.0.1")
    PORT = int(os.getenv("FLASK_PORT", "5000"))
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    # Models and Data paths
    MODEL_PATH = os.getenv(
        "MODEL_PATH",
        os.path.join(BASE_DIR, "models", "retail_demand_forecaster.joblib")
    )
    DATA_PATH = os.getenv(
        "DATA_PATH",
        os.path.join(BASE_DIR, "data.csv")
    )
    OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY") 
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")