// bitgetClient.js – Korrigierte Version für Qwenny
const axios = require('axios');

const BITGET_BASE = 'https://api.bitget.com';

// Hole aktuellen Spot-Preis
async function getSpotPrice(symbol = 'BTCUSDT') {
  try {
    const res = await axios.get(`${BITGET_BASE}/api/v2/spot/market/tickers`, {
      params: { symbol }
    });
    if (res.data.code === '00000' && res.data.data?.[0]?.lastPr) {
      return parseFloat(res.data.data[0].lastPr);
    }
    console.error('Bitget API: Kein Preis in Antwort');
    return null;
  } catch (error) {
    console.error('📉 Preis-Fehler:', error.message);
    return null;
  }
}

// Hole Candles (Klines)
async function getCandles(symbol = 'BTCUSDT', timeframe = '15min', limit = 50) {
  try {
    const res = await axios.get(`${BITGET_BASE}/api/v2/spot/market/candles`, {
      params: { symbol, granularity: timeframe, limit }
    });
    if (res.data.code === '00000' && Array.isArray(res.data.data)) {
      // Jedes Element in `res.data.data` ist ein Array: [ts, open, high, low, close, volume, ...]
      return res.data.data.map(c => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
    }
    console.error('Bitget API: Ungültige Candles-Antwort');
    return [];
  } catch (error) {
    console.error('🕯️ Candle-Fehler:', error.message);
    return [];
  }
}

module.exports = { getSpotPrice, getCandles };