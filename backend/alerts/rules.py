def evaluate(p):
    alerts = []
    temp = p.get("temperature_c")
    smoke = p.get("smoke", False)
    door = p.get("door_open", False)
    motion = p.get("motion", False)

    if smoke:
        alerts.append({"severity":"HIGH","type":"Smoke/gas detected","action":"Notify occupant/caregiver"})
    if temp is not None and (temp < 10 or temp > 32):
        alerts.append({"severity":"MEDIUM","type":"Temperature outside safe demo range","action":"Review environment"})
    if door and motion:
        alerts.append({"severity":"LOW","type":"Door open with motion","action":"Review event"})

    return alerts
