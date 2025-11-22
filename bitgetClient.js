// bitgetClient.js – Qwenny – Stabile Bitget API-Anbindung mit korrekten Granularitäten, Fehlerbehandlung, DEBUG-Modus
require('dotenv').config();
const axios = require('axios');

// ✅ Neue Log-Funktion mit DEBUG-Unterstützung
function log(level, message) {
  const debugEnabled = process.env.DEBUG === 'true';
  if (level === 'debug' && !debugEnabled) return; // Zeige Debug nur, wenn DEBUG=true
  if (level === 'info' || level === 'error' || level === 'warn') {
    console.log(message); // Info, Warn, Error immer anzeigen
  } else if (level === 'debug') {
    console.log(`🐛 bitgetClient DEBUG: ${message}`); // Debug-Logs mit Markierung
  }
}

// ✅ Mapping von internen Intervallen zu Bitget-Granularitäten
const GRANULARITY_MAP = {
  // Spot-Granularitäten (korrekt für Bitget API v2)
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1H',
  '4H': '4H',
  '6H': '6H',
  '12H': '12H',
  '1D': '1D',
  '3D': '3D',
  '1W': '1W',
  '1M': '1M',

  // Veraltete oder falsche Werte (nur für Abwärtskompatibilität)
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
  '1mon': '1M'
};

/**
 * Holt den aktuellen Spot-Preis für ein Symbol
 * @param {string} symbol z. B. 'BTCUSDT'
 * @returns {number|null} Preis oder null bei Fehler
 */
async function getSpotPrice(symbol) {
  try {
    log('debug', `🔍 Preis-Abfrage für ${symbol}...`);

    const response = await axios.get('https://api.bitget.com/api/v2/spot/market/tickers', {
      params: { symbol },
      timeout: 5000
    });

    if (response.data.code !== '00000' || !response.data.data || response.data.data.length === 0) {
      log('error', `❌ Preis-API-Fehler für ${symbol}: ${response.data.msg || 'Keine Daten'}`);
      return null;
    }

    const price = parseFloat(response.data.data[0].lastPr);
    log('debug', `✅ Preis für ${symbol}: ${price}`);
    return price;
  } catch (error) {
    log('error', `💥 Preis-Netzwerkfehler für ${symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Holt Candles für ein Symbol und Intervall
 * @param {string} symbol z. B. 'BTCUSDT'
 * @param {string} interval z. B. '15m', '1D' – wird gemappt
 * @param {number} limit Anzahl der Candles (max. 1000)
 * @returns {array} Array von Candles [{ timestamp, open, high, low, close, volume }]
 */
async function getCandles(symbol, interval, limit = 100) {
  try {
    const granularity = GRANULARITY_MAP[interval] || interval;
    if (!granularity) {
      log('error', `❌ Unbekanntes Intervall: ${interval}`);
      return [];
    }

    log('debug', `🕯️ Candle-Abfrage: ${symbol} | ${interval} (${granularity}) | Limit: ${limit}`);

    const response = await axios.get('https://api.bitget.com/api/v2/spot/market/candles', {
      params: {
        symbol: symbol,
        granularity: granularity,
        limit: Math.min(limit, 1000) // Max 1000 bei Bitget
      },
      timeout: 10000
    });

    if (response.data.code !== '00000') {
      log('error', `❌ Candle-API-Fehler für ${symbol}: ${response.data.msg || 'Unbekannter Fehler'}`);
      return [];
    }

    if (!Array.isArray(response.data.data) || response.data.data.length === 0) {
      log('warn', `⚠️ Keine Candles für ${symbol} (${interval})`);
      return [];
    }

    // Bitget gibt Candles im Format [ts, open, high, low, close, volume] zurück
    const candles = response.data.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    log('debug', `📊 ${candles.length} Candles erhalten für ${symbol} (${interval})`);
    return candles.reverse(); // Älteste zuerst für technische Indikatoren
  } catch (error) {
    log('error', `💥 Candle-Netzwerkfehler für ${symbol} (${interval}): ${error.message}`);
    return [];
  }
}

module.exports = { getSpotPrice, getCandles };