const fetch = require('node-fetch');

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

async function getCurrentWeather(city) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || key === 'your_openweather_key_here') {
    return { error: 'OpenWeather API key not configured. Please add OPENWEATHER_API_KEY to your .env file.' };
  }

  try {
    const url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return { error: `Weather not found for "${city}". ${data.message || ''}` };
    }

    return {
      city: data.name,
      country: data.sys.country,
      temperature: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      wind_speed: Math.round(data.wind.speed * 3.6), // m/s → km/h
      visibility: data.visibility ? Math.round(data.visibility / 1000) : null,
    };
  } catch (err) {
    return { error: `Failed to fetch weather: ${err.message}` };
  }
}

async function getForecast(city) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || key === 'your_openweather_key_here') {
    return { error: 'OpenWeather API key not configured.' };
  }

  try {
    const url = `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&appid=${key}&units=metric&cnt=24`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return { error: `Forecast not found for "${city}". ${data.message || ''}` };
    }

    // Group by day and pick noon readings
    const days = {};
    data.list.forEach(item => {
      const date = item.dt_txt.split(' ')[0];
      const hour = parseInt(item.dt_txt.split(' ')[1]);
      if (!days[date] || hour === 12) {
        days[date] = {
          date,
          temp_min: Math.round(item.main.temp_min),
          temp_max: Math.round(item.main.temp_max),
          description: item.weather[0].description,
          icon: item.weather[0].icon,
        };
      }
    });

    return {
      city: data.city.name,
      forecast: Object.values(days).slice(0, 5),
    };
  } catch (err) {
    return { error: `Failed to fetch forecast: ${err.message}` };
  }
}

module.exports = { getCurrentWeather, getForecast };
