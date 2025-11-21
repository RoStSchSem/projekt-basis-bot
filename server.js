// server.js – Qwenny – Multi-Symbol KI-Handelsbot mit technischen Indikatoren, Daily Cache, DEBUG-Modus, Alpha-Arena-Prompt, Telegram, Confidence 75%
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

// Technische Indikatoren-Bibliothek
const ti = require('technicalindicators');

// Filesystem für Cache
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Neue Log-Funktion mit DEBUG-Unterstützung
function log(level, message) {
  const debugEnabled = process.env.DEBUG === 'true';
  if (level === 'debug' && !debugEnabled) return; // Zeige Debug nur, wenn DEBUG=true
  if (level === 'info' || level === 'error' || level === 'warn') {
    console.log(message); // Info, Warn, Error immer anzeigen
  } else if (level === 'debug') {
    console.log(`🐛 DEBUG: ${message}`); // Debug-Logs mit Markierung
  }
}

// ✅ Speicherüberwachung (alle 30 Sekunden)
setInterval(() => {
  const used = process.memoryUsage();
  log('debug', `📊 Speicher: RSS=${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB`);
}, 30000);

// Health-Check für Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Starte HTTP-Server
app.listen(PORT, '0.0.0.0', () => {
  log('info', `🌐 Qwenny: HTTP-Server läuft auf Port ${PORT}`);
  log('info', '🤖 Qwenny wird gestartet...');
  startTradingBot();
});

// ✅ Telegram-Nachricht senden
async function sendTelegram(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    log('warn', '⚠️ TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlt – Telegram-Nachricht nicht gesendet');
    return false; // Gibt false zurück
  }

  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown' // Optional: für fett/kursiv
    });
    log('info', '✅ Telegram-Nachricht gesendet');
    return true;
  } catch (error) {
    log('error', `🚨 Telegram-Fehler: ${error.message}`);
    return false;
  }
}

// Pfad zur Cache-Datei
const DAILY_CACHE_FILE = path.join(__dirname, 'cache', 'daily-cache.json');

// Funktion: Tages-Candles einmal täglich laden
async function fetchDailyCandles() {
  log('info', '🔄 Lade Tages-Candles für alle Symbole...');

  // Stelle sicher, dass das Verzeichnis existiert
  const cacheDir = path.dirname(DAILY_CACHE_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheExists = fs.existsSync(DAILY_CACHE_FILE);
  let cache = cacheExists ? JSON.parse(fs.readFileSync(DAILY_CACHE_FILE, 'utf8')) : {};

  for (const symbol of SYMBOLS_TO_WATCH) {
    try {
      // ✅ Korrektur: '1D' statt '1d'
      const candles1d = await getCandles(symbol, '1D', 100); // Reduziert auf 100 für Stabilität

      if (candles1d.length < 20) {
        log('warn', `⚠️ Zu wenige Tages-Candles für ${symbol}: ${candles1d.length}`);
        continue;
      }

      const prices = candles1d.map(c => c.close);

      // ✅ Sicherstellen, dass genug Daten für EMA vorhanden
      if (prices.length < 100) {
        log('warn', `⚠️ Nicht genug Daten für EMA-Berechnung bei ${symbol}`);
        continue;
      }

      const ema20 = ti.ema({ values: prices, period: 20 }).slice(-1)[0];
      const ema50 = ti.ema({ values: prices, period: 50 }).slice(-1)[0];
      const ema100 = ti.ema({ values: prices, period: 100 }).slice(-1)[0];

      // Berechne Wochen-Trend (aus 7 Tagen)
      let weeklyTrend = 'n/a';
      if (candles1d.length >= 7) {
        const weeklyPrices = candles1d.slice(-7).map(c => c.close);
        const weeklyEma = ti.ema({ values: weeklyPrices, period: 5 }).slice(-1)[0];
        const currentWeeklyPrice = weeklyPrices[weeklyPrices.length - 1];

        if (currentWeeklyPrice > weeklyEma) {
          weeklyTrend = 'up';
        } else if (currentWeeklyPrice < weeklyEma) {
          weeklyTrend = 'down';
        } else {
          weeklyTrend = 'sideways';
        }
      }

      cache[symbol] = {
        lastUpdated: new Date().toISOString(),
        dailyCandles: candles1d,
        ema20,
        ema50,
        ema100,
        weeklyTrend
      };

      log('info', `✅ Tages-Candles für ${symbol} gecached: ${candles1d.length} Tage`);

    } catch (e) {
      log('error', `❌ Fehler beim Laden von Tages-Candles für ${symbol}: ${e.message}`);
    }

    // Kurze Pause zwischen Requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Speichere Cache
  fs.writeFileSync(DAILY_CACHE_FILE, JSON.stringify(cache, null, 2));
  log('info', '💾 Tages-Candles zwischengespeichert.');
}

// Funktion: Lies den Tages-Cache
function loadDailyCache(symbol) {
  if (!fs.existsSync(DAILY_CACHE_FILE)) return null;

  const cache = JSON.parse(fs.readFileSync(DAILY_CACHE_FILE, 'utf8'));
  return cache[symbol] || null;
}

// Funktion: Aggregiere 15min-Candles zu 1h-Candles
function aggregateToHourly(candles15min) {
  const hourlyCandles = [];
  for (let i = 0; i < candles15min.length; i += 4) {
    const slice = candles15min.slice(i, i + 4);
    if (slice.length < 4) continue; // Nicht genug Daten für eine volle Stunde

    const open = slice[0].open;
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = slice[slice.length - 1].close;
    const volume = slice.reduce((sum, c) => sum + c.volume, 0);

    hourlyCandles.push({ open, high, low, close, volume });
  }
  return hourlyCandles;
}

// Funktion: Aggregiere 1h-Candles zu 4h-Candles
function aggregateTo4Hourly(candles1h) {
  const fourHourlyCandles = [];
  for (let i = 0; i < candles1h.length; i += 4) {
    const slice = candles1h.slice(i, i + 4);
    if (slice.length < 4) continue;

    const open = slice[0].open;
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = slice[slice.length - 1].close;
    const volume = slice.reduce((sum, c) => sum + c.volume, 0);

    fourHourlyCandles.push({ open, high, low, close, volume });
  }
  return fourHourlyCandles;
}

// Funktion: Trend aus Candles berechnen (20-EMA)
function calculateTrend(prices) {
  if (prices.length < 20) return 'n/a';

  const ema20 = ti.ema({ values: prices, period: 20 }).slice(-1)[0];
  const currentPrice = prices[prices.length - 1];

  if (currentPrice > ema20) return 'up';
  else if (currentPrice < ema20) return 'down';
  else return 'sideways';
}

// Globale Flag für Startup-Test
let hasSentStartupMessage = false;

// Liste der zu überwachenden Symbole
const SYMBOLS_TO_WATCH = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'SUIUSDT',
  'XRPUSDT'
];

// Autonomer Trading-Zyklus für alle Symbole
async function tradingCycle() {
  log('info', `\n🔄 Qwenny: Starte Multi-Symbol-Zyklus – ${new Date().toISOString()}`);

  for (const symbol of SYMBOLS_TO_WATCH) {
    log('debug', `🔍 Analysiere ${symbol}...`);

    // ✅ Korrektur: '15m' statt '15min'
    const price = await getSpotPrice(symbol);
    const candles15min = await getCandles(symbol, '15m', 96); // 96 = 24h a 15min

    if (price === null || candles15min.length === 0) {
      log('warn', `⚠️ Keine 15min-Daten für ${symbol} – überspringe`);
      continue;
    }

    // Candle-URLs und Antworten (nur im Debug-Modus)
    log('debug', `🕯️ 15min-URL: https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=15m&limit=96`);

    // Einmalige Startup-Test-Nachricht (nur beim allerersten Durchlauf)
    if (!hasSentStartupMessage) {
      const startupMessage = `✅ *Qwenny: Startup bestätigt – läuft für alle Symbole*\n\n` +
        `Erstes Symbol: ${symbol}\nPreis: ${price}\nZeit: ${new Date().toISOString()}\nStatus: OK – Benachrichtigungssystem funktioniert!`;

      const telegramSuccess = await sendTelegram(startupMessage);
      if (telegramSuccess) {
        hasSentStartupMessage = true;
        log('info', '💬 Qwenny: Startup-Nachricht gesendet');
      } else {
        log('error', '❌ Qwenny: Startup-Nachricht fehlgeschlagen');
      }
    }

    // Technische Indikatoren aus 15min-Candles
    const prices15min = candles15min.map(c => c.close);
    const volumes15min = candles15min.map(c => c.volume);
    const highs15min = candles15min.map(c => c.high);
    const lows15min = candles15min.map(c => c.low);

    // RSI (14)
    let rsi = 'n/a';
    if (prices15min.length >= 14) {
      const rsiValues = ti.rsi({ values: prices15min, period: 14 });
      rsi = rsiValues[rsiValues.length - 1];
    }

    // MACD (12,26,9)
    let macd = 'n/a', macdSignal = 'n/a', macdHistogram = 'n/a';
    if (prices15min.length >= 35) { // Mindestens 26 + 9 für MACD
      const macdResult = ti.macd({
        values: prices15min,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      });
      const latestMacd = macdResult[macdResult.length - 1];
      if (latestMacd) {
        macd = latestMacd.MACD;
        macdSignal = latestMacd.signal;
        macdHistogram = latestMacd.histogram;
      }
    }

    // Stochastik (14,3,3)
    let stochK = 'n/a', stochD = 'n/a';
    if (prices15min.length >= 14) {
      const stoch = ti.stochastic({
        high: highs15min,
        low: lows15min,
        close: prices15min,
        period: 14,
        signalPeriod: 3
      });
      const latestStoch = stoch[stoch.length - 1];
      if (latestStoch) {
        stochK = latestStoch.k;
        stochD = latestStoch.d;
      }
    }

    // Volumen (letztes Intervall)
    const volume = volumes15min[volumes15min.length - 1];

    // Bestimme den Trend aus den letzten 3 Candles (kurzfristig)
    const last3Candles = candles15min.slice(-3);
    const trend15min = last3Candles.every((c, i, arr) => i === 0 || c.close < arr[i - 1].close) ? 'down' :
                  last3Candles.every((c, i, arr) => i === 0 || c.close > arr[i - 1].close) ? 'up' : 'sideways';

    // 🔍 Trend aus aggregierten 1h-Candles
    const candles1h = aggregateToHourly(candles15min);
    const prices1h = candles1h.map(c => c.close);
    const trend1h = calculateTrend(prices1h);

    // 🔍 Trend aus aggregierten 4h-Candles
    const candles4h = aggregateTo4Hourly(candles1h);
    const prices4h = candles4h.map(c => c.close);
    const trend4h = calculateTrend(prices4h);

    // 🔍 Lade langfristige Daten aus dem Cache
    const dailyData = loadDailyCache(symbol);
    const trend1d = dailyData ? calculateTrend(dailyData.dailyCandles.map(c => c.close)) : 'n/a';
    const weeklyTrend = dailyData ? dailyData.weeklyTrend : 'n/a';
    const ema20_daily = dailyData ? dailyData.ema20 : 'n/a';
    const ema50_daily = dailyData ? dailyData.ema50 : 'n/a';
    const ema100_daily = dailyData ? dailyData.ema100 : 'n/a';

    // DEBUG: Zeige Trends in Logs
    log('debug', `📊 Trends für ${symbol}: 15min=${trend15min}, 1h=${trend1h}, 4h=${trend4h}, 1d=${trend1d}, 1w=${weeklyTrend}`);

    // 🔍 Hole zusätzliche Daten von Bitget (z. B. Orderbuch)
    let orderbook = null;
    try {
      const orderbookRes = await axios.get(`https://api.bitget.com/api/v2/spot/market/orderbook`, {
        params: { symbol, limit: 5 }
      });
      if (orderbookRes.data.code === '00000') {
        orderbook = orderbookRes.data.data;
      }
    } catch (e) {
      log('debug', ` candle-Book für ${symbol} nicht verfügbar: ${e.message}`);
    }

    // Deepseek befragen (Alpha-Arena-Prompt mit allen Trends)
    const candleSummary = candles15min.slice(-3).map(c => `C:${c.close.toFixed(2)}`).join(', ');

    const prompt = `
Du bist ein professioneller Krypto-Trader in der Alpha Arena.
Dein Ziel ist es, risikoangepasste Rendite zu maximieren und Drawdowns zu minimieren.
Du handelst Spot-Paare auf Bitget.
Du musst deine Antwort im unten definierten JSON-Format geben.

MARKTDATEN:
- Symbol: ${symbol}
- Aktueller Preis: ${price.toFixed(2)} USDT
- Letzte Candles (15min): ${candleSummary}
- Orderbuch: ${orderbook ? JSON.stringify(orderbook) : 'n/a'}

TECHNISCHE INDIKATOREN (berechnet aus letzten 15min-Daten):
- RSI (14): ${typeof rsi === 'number' ? rsi.toFixed(2) : rsi}
- MACD (12,26,9): ${typeof macd === 'number' ? macd.toFixed(2) : macd} (Signal: ${typeof macdSignal === 'number' ? macdSignal.toFixed(2) : macdSignal})
- Stochastik (14,3,3): %K: ${typeof stochK === 'number' ? stochK.toFixed(2) : stochK}, %D: ${typeof stochD === 'number' ? stochD.toFixed(2) : stochD}
- Volumen: ${volume}

TREND-ANALYSE (basierend auf 20-EMA):
- 15min-Trend: ${trend15min} (kurzfristig)
- 1h-Trend: ${trend1h} (mittel: aggregiert aus 15min)
- 4h-Trend: ${trend4h} (mittel: aggregiert aus 1h)
- 1d-Trend: ${trend1d} (lang: aus Tagesdaten)
- 1w-Trend: ${weeklyTrend} (lang: aggregiert aus 1d)

LANGFRISTIGE INDIKATOREN (aus Tagesdaten):
- EMA20: ${typeof ema20_daily === 'number' ? ema20_daily.toFixed(2) : ema20_daily}
- EMA50: ${typeof ema50_daily === 'number' ? ema50_daily.toFixed(2) : ema50_daily}
- EMA100: ${typeof ema100_daily === 'number' ? ema100_daily.toFixed(2) : ema100_daily}

WICHTIG:
- Der 1w-Trend ist dominanter als der 1d-Trend.
- Der 1d-Trend ist dominanter als der 4h-Trend.
- Der 4h-Trend ist dominanter als der 1h-Trend.
- Der 1h-Trend ist dominanter als der 15min-Trend.

Wenn der 1w-Trend 'down' ist, ist dies ein starkes Signal für SHORT, auch wenn andere Skalen 'up' zeigen.
Wenn der 1d-Trend 'down' ist, ist dies ein starkes Signal für SHORT, auch wenn 15min/1h 'up' zeigen.
Wenn alle Trends 'sideways' oder 'n/a' sind, dann entscheide vorsichtig.

BEISPIEL-FORMULIERUNG FÜR DEEPSEEK:
- Tagestrend: bärisch, Stundentrend: bullisch → Trendbruch, Widerstand gebrochen
- Tagestrend: bärisch, Stundentrend: bärisch → weiterhin bärisch
- Tagestrend: bullisch, Stundentrend: bullisch → weiterhin bullisch
- Tagestrend: bullisch, Stundentrend: bärisch → möglicher Trendwechsel

KONTEXT DEINES KONTOS (simuliert):
- Kontostand: 10000 USDT
- Verfügbares Guthaben: 9500 USDT
- Positionsgröße (aktuell): 0
- Max. Hebel: 1
- Max. Position: 2000 USDT pro Trade
- Max. Drawdown: 10%

ANALYSE:
- Ist der Markt überkauft (RSI > 70) oder überverkauft (RSI < 30)?
- Gibt es einen Bullish/Bearish-Crossover bei MACD oder Stochastik?
- Ist das Volumen stark genug, um den Trend zu bestätigen?
- Ist das Orderbuch bullish (mehr Käufer) oder bearish (mehr Verkäufer)?
- Ist der aktuelle Preis sinnvoll für LONG/SHORT/HOLD?

ENTSCHEIDUNG:
- Entweder: LONG, SHORT oder HOLD
- Größe: 0.01 - 0.1 (abhängig von Risiko und Guthaben)
- Stop-Loss: 2-5% unter Entry
- Take-Profit: 5-10% über Entry
- Verwende nur Spot-Handel (kein Leverage)

Antworte NUR im folgenden JSON-Format:
{
  "action": "...",
  "symbol": "...",
  "size": 0.0,
  "entry_price": 0.00,
  "stop_loss": 0.00,
  "take_profit": 0.00,
  "confidence": 0.0,
  "reason": "..."
}
Kein Text davor oder danach.
`.trim();

    try {
      const deepseekRes = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
          timeout: 10000
        }
      );

      const raw = deepseekRes.data.choices[0].message.content.trim();
      const jsonMatch = raw.match(/\{[^{}]*\}/);
      if (!jsonMatch) {
        log('error', `❌ Kein gültiges JSON für ${symbol}`);
        continue;
      }

      const decision = JSON.parse(jsonMatch[0]);

      // 🔍 Nur bei Signal (nicht HOLD) UND Confidence >= 75% Nachricht senden
      if (decision.action && decision.action !== 'HOLD' && decision.confidence >= 0.75) {
        const subject = `🚨 Qwenny Signal: ${decision.action} ${symbol}`;
        const text = `
Einstieg: ${decision.entry_price} USDT
Stop-Loss: ${decision.stop_loss} USDT
Take-Profit: ${decision.take_profit} USDT
Confidence: ${(decision.confidence * 100).toFixed(1)}%
Grund: ${decision.reason || '—'}

Datenquelle: Bitget Spot API
Zeit: ${new Date().toISOString()}
        `.trim();

        await sendEmail(subject, text);

        log('info', `✅ Qwenny: Signal gesendet: ${decision.action} ${symbol}`);
      } else {
        log('debug', `➡️ Qwenny: Kein Signal für ${symbol} – HOLD oder Confidence < 75%`);
      }
    } catch (error) {
      log('error', `💥 Qwenny: Fehler bei ${symbol}: ${error.message}`);
    }
  }

  log('info', `✅ Qwenny: Multi-Symbol-Zyklus abgeschlossen`);
}

// Startfunktion
function startTradingBot() {
  // Starte den täglichen Abruf einmalig (oder nach einem Zeitplan)
  fetchDailyCandles(); // Sofort starten
  setInterval(fetchDailyCandles, 24 * 60 * 60 * 1000); // Alle 24h

  // Starte den intraday-Zyklus
  tradingCycle(); // Sofort starten
  setInterval(tradingCycle, 60_000); // Alle 60 Sekunden
}