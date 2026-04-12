import joblib

model = joblib.load('d:/retail-forecaster/backend/models/retail_demand_forecaster.joblib')
print(type(model))
if hasattr(model, 'feature_names_in_'):
    print("Features:", model.feature_names_in_)
else:
    print("No feature_names_in_ attribute.")
