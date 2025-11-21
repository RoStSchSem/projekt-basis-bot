// bitgetClient.js - NEU ERSTELLEN
const axios = require('axios');

class BitgetClient {
    constructor() {
        this.baseURL = 'https://api.bitget.com/api/v2/spot/market';
        this.rateLimitDelay = 100; // ms between requests
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ✅ KORREKTE Granularity Mapping
    mapInterval(interval) {
        const mapping = {
            '15min': '15m',
            '1d': '1D', 
            '1h': '1H',
            '4h': '4H'
        };
        return mapping[interval] || interval;
    }

    async getCandles(symbol, interval, limit = 100) {
        try {
            const granularity = this.mapInterval(interval);
            
            console.log(`🔍 Fetching ${symbol} ${granularity} candles (limit: ${limit})`);
            
            const response = await axios.get(`${this.baseURL}/candles`, {
                params: {
                    symbol: symbol,
                    granularity: granularity,
                    limit: Math.min(limit, 1000)
                },
                timeout: 10000
            });

            // ✅ Bitget Error Handling
            if (response.data.code !== '00000') {
                throw new Error(`Bitget API Error: ${response.data.msg} (code: ${response.data.code})`);
            }

            if (!response.data.data || response.data.data.length === 0) {
                console.warn(`⚠️ Keine Candles erhalten für ${symbol} ${granularity}`);
                return [];
            }

            // ✅ Parse Candles - Bitget Format: [timestamp, open, high, low, close, volume]
            const candles = response.data.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));

            console.log(`✅ ${candles.length} Candles für ${symbol} ${granularity} erhalten`);
            return candles;

        } catch (error) {
            console.error(`❌ Fehler in getCandles für ${symbol} ${interval}:`, error.message);
            
            // Spezifische Fehlerbehandlung
            if (error.code === 'ECONNRESET') {
                console.log('🔁 Verbindung abgebrochen, retry...');
            } else if (error.response?.status === 429) {
                console.log('⏳ Rate Limit erreicht, warte...');
                await this.sleep(2000);
            }
            
            return [];
        }
    }

    async getSpotPrice(symbol) {
        try {
            console.log(`🔍 Fetching price for ${symbol}`);
            
            const response = await axios.get(`${this.baseURL}/tickers`, {
                params: { symbol },
                timeout: 5000
            });

            if (response.data.code === '00000' && response.data.data.length > 0) {
                const price = parseFloat(response.data.data[0].lastPr);
                console.log(`✅ Price for ${symbol}: ${price}`);
                return price;
            }
            
            console.warn(`⚠️ Keine Price-Daten für ${symbol}`);
            return null;

        } catch (error) {
            console.error(`❌ Fehler in getSpotPrice für ${symbol}:`, error.message);
            return null;
        }
    }
}

// ✅ Singleton Instance
const bitgetClient = new BitgetClient();

module.exports = {
    getCandles: (symbol, interval, limit) => bitgetClient.getCandles(symbol, interval, limit),
    getSpotPrice: (symbol) => bitgetClient.getSpotPrice(symbol)
};
