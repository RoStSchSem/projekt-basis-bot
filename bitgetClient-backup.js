async function getCandles(symbol, interval, limit = 100) {
  try {
    // Mapping Ihrer Intervalle zu Bitget's Granularity
    const granularityMap = {
      '15min': '15m',
      '1d': '1D',
      '1h': '1H',
      '4h': '4H'
    };

    const granularity = granularityMap[interval] || interval;

    const response = await axios.get('https://api.bitget.com/api/v2/spot/market/candles', {
      params: {
        symbol: symbol,
        granularity: granularity,
        limit: Math.min(limit, 1000) // Max 1000 bei Bitget
      },
      timeout: 10000
    });

    if (response.data.code !== '00000') {
      throw new Error(`Bitget API Error: ${response.data.msg}`);
    }

    // Prüfe, ob Daten vorhanden sind
    if (!response.data.data || response.data.data.length === 0) {
      log('warn', `⚠️ Keine Candles für ${symbol} (${interval})`);
      return [];
    }

    // Bitget gibt Daten im Format zurück: [timestamp, open, high, low, close, volume]
    return response.data.data.map(candle => ({
      timestamp: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    })).reverse(); // Älteste zuerst für technische Indikatoren

  } catch (error) {
    console.error(`❌ Fehler beim Abrufen von Candles für ${symbol} (${interval}):`, error.message);
    return [];
  }
}
