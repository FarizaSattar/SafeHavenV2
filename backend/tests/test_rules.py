from alerts.rules import evaluate

def test_smoke_alert():
    alerts = evaluate({"smoke": True, "temperature_c": 22, "door_open": False, "motion": False})
    assert any(a["severity"] == "HIGH" for a in alerts)
