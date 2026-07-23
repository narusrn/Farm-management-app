import requests
import pandas as pd


def get_historic_weather(lat: float, lon: float, start_date: str, end_date: str) -> pd.DataFrame:
    """ดึงข้อมูลสภาพอากาศย้อนหลังจาก Open-Meteo API"""
    try:
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start_date,
            "end_date": end_date,
            "hourly": "temperature_2m,relativehumidity_2m,precipitation",
            "timezone": "Asia/Bangkok"
        }

        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        df = pd.DataFrame(data['hourly'])
        df['time'] = pd.to_datetime(df['time'])
        return df

    except (requests.RequestException, ValueError) as e:
        print(f"⚠️ Error in get_historic_weather: {e}")
        return pd.DataFrame()


def get_forecast_weather(lat: float, lon: float, forecast_days: int) -> pd.DataFrame:
    """ดึงข้อมูลพยากรณ์อากาศรายชั่วโมงจาก Open-Meteo"""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,relativehumidity_2m,precipitation",
        "timezone": "auto",
        "forecast_days": forecast_days
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if "hourly" not in data:
            raise ValueError("Response JSON does not contain 'hourly'")

        df = pd.DataFrame(data['hourly'])
        df['time'] = pd.to_datetime(df['time'])
        return df

    except (requests.RequestException, ValueError) as e:
        print(f"⚠️ Error in get_forecast_weather: {e}")
        return pd.DataFrame()


def aggregate_forecast_daily(df: pd.DataFrame) -> pd.DataFrame:
    """แปลงข้อมูล hourly → daily พร้อมนับวันเงื่อนไขโรค blast และ blb"""
    if df.empty:
        return pd.DataFrame()

    df['date'] = df['time'].dt.date
    df_daily = df.groupby('date').agg({
        'temperature_2m': ['max', 'min'],
        'precipitation': 'sum',
        'relativehumidity_2m': 'mean'
    })

    df_daily.columns = [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation',
        'relativehumidity_2m',
    ]
    df_daily = df_daily.reset_index()

    df_daily['temperature_2m_avg'] = (
        df_daily['temperature_2m_max'] + df_daily['temperature_2m_min']
    ) / 2
    
    # monthly_precipitation = df_daily['precipitation'].sum()
    
    # ✅ เพิ่มคอลัมน์เดือน
    df_daily["month"] = pd.to_datetime(df_daily["date"]).dt.to_period("M").astype(str)

    # ✅ คำนวณปริมาณน้ำฝนรวมรายเดือน
    monthly_rain = df_daily.groupby("month")["precipitation"].sum().rename("monthly_precipitation")

    df_daily = df_daily.merge(monthly_rain, on="month", how="left")
    
    def func_blast(rh, temp):
        if func_blast.count == 7:
            func_blast.count = 0
        if (rh >= 85) and (temp > 25):
            func_blast.count += 1
        else:
            func_blast.count = 0
        return func_blast.count
    func_blast.count = 0

    def func_blb(rh, temp, prec):
        if func_blb.count == 7:
            func_blb.count = 0
        if (rh >= 80) and (temp > 25) and (prec >= 70):
            func_blb.count += 1
        else:
            func_blb.count = 0
        return func_blb.count
    func_blb.count = 0

    df_daily['cnt_blast_disease'] = df_daily.apply(
        lambda row: func_blast(row.relativehumidity_2m, row.temperature_2m_avg),
        axis=1
    )

    df_daily['cnt_blb_disease'] = df_daily.apply(
        lambda row: func_blb(row.relativehumidity_2m, row.temperature_2m_avg, row.monthly_precipitation),
        axis=1
    )

    # ✅ ความเสี่ยงอุณหภูมิสูง/ต่ำที่ทำให้ข้าวเป็นหมันแต่ละระยะ
    def func_lt(mintemp):
        if func_lt.count == 6:
            func_lt.count = 0
        if mintemp < 15:
            func_lt.count += 1
        else:
            func_lt.count = 0
        return func_lt.count
    func_lt.count = 0

    def func_ht(maxtemp):
        return 1 if maxtemp > 40 else 0

    def func_sd(mintemp, maxtemp):
        return 1 if (mintemp < 16 or maxtemp > 40) else 0

    def func_gw1(mintemp, maxtemp):
        return 1 if (mintemp < 9 or maxtemp > 35) else 0

    def func_gw2(mintemp, maxtemp):
        return 1 if (mintemp < 12 or maxtemp > 35) else 0

    def func_flw(mintemp, maxtemp):
        return 1 if (mintemp < 15 or maxtemp > 35) else 0

    def func_hvs(mintemp, maxtemp):
        return 1 if (mintemp < 12 or maxtemp > 30) else 0

    df_daily['cnt_lt_risk'] = df_daily.apply(
        lambda row: func_lt(row.temperature_2m_min), axis=1
    )
    df_daily['cnt_ht_risk'] = df_daily.apply(
        lambda row: func_ht(row.temperature_2m_max), axis=1
    )
    df_daily['cnt_sd_risk'] = df_daily.apply(
        lambda row: func_sd(row.temperature_2m_min, row.temperature_2m_max), axis=1
    )
    df_daily['cnt_gw1_risk'] = df_daily.apply(
        lambda row: func_gw1(row.temperature_2m_min, row.temperature_2m_max), axis=1
    )
    df_daily['cnt_gw2_risk'] = df_daily.apply(
        lambda row: func_gw2(row.temperature_2m_min, row.temperature_2m_max), axis=1
    )
    df_daily['cnt_flw_risk'] = df_daily.apply(
        lambda row: func_flw(row.temperature_2m_min, row.temperature_2m_max), axis=1
    )
    df_daily['cnt_hvs_risk'] = df_daily.apply(
        lambda row: func_hvs(row.temperature_2m_min, row.temperature_2m_max), axis=1
    )

    del df_daily["month"]

    return df_daily


def get_forecast_risk_records(lat: float, lon: float, forecast_days: int = 16) -> list[dict]:
    """ดึงพยากรณ์อากาศจาก Open-Meteo แล้วคำนวณ risk รายวัน คืนเป็น list of dict (date เป็น string ตรงกับ records ของ NECTEC)"""
    df = get_forecast_weather(lat, lon, forecast_days)
    if df.empty:
        return []
    df_daily = aggregate_forecast_daily(df)
    df_daily["date"] = df_daily["date"].astype(str)
    return df_daily.to_dict("records")
