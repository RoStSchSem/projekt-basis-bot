stabiler Server.js

// server.js – Qwenny – Multi-Symbol KI-Handelsbot mit Alpha-Arena-Prompt, Telegram, DEBUG-Modus, Speicherüberwachung
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

// Technische Indikatoren-Bibliothek
const ti = require('technicalindicators');

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

    // Hole Daten von Bitget
    const price = await getSpotPrice(symbol);
    const candles = await getCandles(symbol, '15min', 50); // Mehr Candles für Indikatoren

    if (price === null || candles.length === 0) {
      log('warn', `⚠️ Keine Daten für ${symbol} – überspringe`);
      continue;
    }

    // Candle-URL und Antwort (nur im Debug-Modus)
    log('debug', `🕯️ Candle-URL: https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=15min&limit=50`);
    log('debug', `📄 Candle-Antwort: ${JSON.stringify(candles.slice(-2))}`); // Nur letzte 2 Candles anzeigen, wenn Debug

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

    // Technische Indikatoren berechnen
    const prices = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // RSI (14)
    let rsi = 'n/a';
    if (prices.length >= 14) {
      const rsiValues = ti.rsi({ values: prices, period: 14 });
      rsi = rsiValues[rsiValues.length - 1];
    }

    // MACD (12,26,9)
    let macd = 'n/a', macdSignal = 'n/a', macdHistogram = 'n/a';
    if (prices.length >= 35) { // Mindestens 26 + 9 für MACD
      const macdResult = ti.macd({
        values: prices,
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
    if (prices.length >= 14) {
      const stoch = ti.stochastic({
        high: highs,
        low: lows,
        close: prices,
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
    const volume = volumes[volumes.length - 1];

    // Bestimme den Trend aus den letzten 3 Candles
    const last3Candles = candles.slice(-3);
    const trend = last3Candles.every((c, i, arr) => i === 0 || c.close < arr[i - 1].close) ? 'down' :
                  last3Candles.every((c, i, arr) => i === 0 || c.close > arr[i - 1].close) ? 'up' : 'sideways';

    // DEBUG: Zeige Indikatoren in Logs
    log('debug', `📊 Indikatoren für ${symbol}: RSI=${typeof rsi === 'number' ? rsi.toFixed(2) : rsi}, MACD=${typeof macd === 'number' ? macd.toFixed(2) : macd}, StochK=${typeof stochK === 'number' ? stochK.toFixed(2) : stochK}, Volume=${volume}, Trend=${trend}`);

    // 🔍 Hole zusätzliche Daten von Bitget (z. B. Orderbuch, Funding Rate, Open Interest)
    // Beispiel-Endpunkte (müssen ggf. angepasst werden je nach Bitget API)
    let orderbook = null;
    let fundingRate = 'n/a';
    let openInterest = 'n/a';

    try {
      // Orderbuch abrufen (falls verfügbar)
      const orderbookRes = await axios.get(`https://api.bitget.com/api/v2/spot/market/orderbook`, {
        params: { symbol, limit: 5 }
      });
      if (orderbookRes.data.code === '00000') {
        orderbook = orderbookRes.data.data;
      }
    } catch (e) {
      log('debug', ` candle-Book für ${symbol} nicht verfügbar: ${e.message}`);
    }

    // Deepseek befragen (Alpha-Arena-Prompt für Spot + Bitget)
    const candleSummary = candles.slice(-3).map(c => `C:${c.close.toFixed(2)}`).join(', ');

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
- Funding Rate: ${fundingRate}
- Open Interest: ${openInterest}

TECHNISCHE INDIKATOREN (berechnet aus letzten 15min-Daten):
- RSI (14): ${typeof rsi === 'number' ? rsi.toFixed(2) : rsi}
- MACD (12,26,9): ${typeof macd === 'number' ? macd.toFixed(2) : macd} (Signal: ${typeof macdSignal === 'number' ? macdSignal.toFixed(2) : macdSignal})
- Stochastik (14,3,3): %K: ${typeof stochK === 'number' ? stochK.toFixed(2) : stochK}, %D: ${typeof stochD === 'number' ? stochD.toFixed(2) : stochD}
- Volumen: ${volume}

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

WICHTIG: Der aktuelle Trend ist: ${trend}. 
- Wenn der Trend abwärts ist, dann ist das ein starkes Signal für SHORT, auch wenn RSI überverkauft ist.
- Wenn der Trend aufwärts ist, dann ist das ein starkes Signal für LONG, auch wenn RSI überkauft ist.
- Wenn der Trend seitwärts ist, dann achte auf RSI und Stochastik.

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

      // 🔍 NEU: Nur bei Signal (nicht HOLD) UND Confidence >= 75% Nachricht senden
      if (decision.action && decision.action !== 'HOLD' && decision.confidence >= 0.75) {
        const telegramMessage = `🚨 *Qwenny Signal: ${decision.action} ${decision.symbol}*\n\n` +
          `*Größe:* ${decision.size}\n` +
          `*Einstieg:* ${decision.entry_price} USDT\n` +
          `*Stop-Loss:* ${decision.stop_loss} USDT\n` +
          `*Take-Profit:* ${decision.take_profit} USDT\n` +
          `*Confidence:* ${(decision.confidence * 100).toFixed(1)}%\n` +
          `*Grund:* ${decision.reason || '—'}\n\n` +
          `Datenquelle: Bitget Spot API\n` +
          `Zeit: ${new Date().toISOString()}`;

        await sendTelegram(telegramMessage); // ✅ Kein E-Mail-Backup mehr

        log('info', `✅ Qwenny: Signal gesendet: ${decision.action} ${decision.symbol}`);
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
  tradingCycle(); // Sofort starten
  setInterval(tradingCycle, 60_000); // Alle 60 Sekunden
}