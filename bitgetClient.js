// bitgetClient.js – Korrekter Bitget Spot API-Client (ohne Auth)
const axios = require('axios');

const BITGET_BASE = 'https://api.bitget.com';

/**
 * Holt den aktuellen Spot-Preis für ein Symbol (z. B. 'BTCUSDT')
 */

async function getSpotPrice(symbol = 'BTCUSDT') {
  try {
    const url = `${BITGET_BASE}/api/v2/spot/market/tickers?symbol=${symbol}`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.data.code === '00000' && res.data.data?.[0]?.lastPr) {
      return parseFloat(res.data.data[0].lastPr); // ⬅️ lastPr statt last
    }
    console.error('Bitget API: Kein Preis in Antwort');
    return null;
  } catch (error) {
    console.error('📉 Preis-Fehler:', error.message);
    return null;
  }
}

/**
 * Holt historische Candles (Klines) für ein Symbol
 * Gültige Zeitintervalle: '1min', '3min', '5min', '15min', '30min', '1h', '4h', '6h', '12h', '1day', ...
 */
async function getCandles(symbol = 'BTCUSDT', timeframe = '15min', limit = 5) {
  try {
    const url = `${BITGET_BASE}/api/v2/spot/market/candles?symbol=${symbol}&granularity=${timeframe}&limit=${limit}`;
    console.log('🕯️ Candle-URL:', url);
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log('📄 Candle-Antwort:', res.data);
    if (res.data.code === '00000' && Array.isArray(res.data.data)) {
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
    console.error('🕯️ Candle-Fehler:', error.response?.data || error.message);
    return [];
  }
}

module.exports = { getSpotPrice, getCandles };