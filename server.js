// server.js – Qwenny – Multi-Symbol KI-Handelsbot mit technischen Indikatoren
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

// Technische Indikatoren-Bibliothek
const ti = require('technicalindicators');

const app = express();
const PORT = process.env.PORT || 10000;

// Health-Check für Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Starte HTTP-Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Qwenny: HTTP-Server läuft auf Port ${PORT}`);
  console.log('🤖 Qwenny wird gestartet...');
  startTradingBot();
});

// Resend-E-Mail senden
async function sendEmail(subject, text) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Qwenny <onboarding@resend.dev>', // ✅ Verifizierte Domain
      to: ['ros72.rs@gmail.com'],             // ✅ Deine E-Mail
      subject: subject,
      text: text
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
    });
    console.log('✅ E-Mail gesendet an ros72.rs@gmail.com');
  } catch (error) {
    console.error('📧 Resend-Fehler:', error.response?.data || error.message);
  }
}

// Globale Flag für Startup-Test
let hasSentStartupEmail = false;

// Liste der zu überwachenden Symbole
const SYMBOLS_TO_WATCH = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'SUIUSDT', // Korrigiert: Spot statt Futures
  'XRPUSDT'
];

// Autonomer Trading-Zyklus für alle Symbole
async function tradingCycle() {
  console.log(`\n🔄 Qwenny: Starte Multi-Symbol-Zyklus – ${new Date().toISOString()}`);

  // Gehe jedes Symbol durch
  for (const symbol of SYMBOLS_TO_WATCH) {
    console.log(`🔍 Analysiere ${symbol}...`);

    // Hole Daten von Bitget
    const price = await getSpotPrice(symbol);
    const candles = await getCandles(symbol, '15min', 50); // Mehr Candles für Indikatoren

    if (price === null || candles.length === 0) {
      console.warn(`⚠️ Keine Daten für ${symbol} – überspringe`);
      continue;
    }

    // Einmalige Startup-Test-E-Mail (nur beim allerersten Durchlauf)
    if (!hasSentStartupEmail) {
      await sendEmail(
        `✅ Qwenny: Startup bestätigt – läuft für alle Symbole`,
        `Erstes Symbol: ${symbol}\nPreis: ${price}\nZeit: ${new Date().toISOString()}\nStatus: OK – E-Mail-System funktioniert!`
      );
      hasSentStartupEmail = true;
      console.log('📧 Qwenny: Startup-Test-E-Mail gesendet');
    }

    // Technische Indikatoren berechnen
    const prices = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

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
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
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

    // Deepseek befragen (neuer geänderter Prompt mit Indikatoren)
    const candleSummary = candles.slice(-3).map(c => `C:${c.close.toFixed(2)}`).join(', ');

    const prompt = `
Du bist ein professioneller Krypto-Trader in der Alpha Arena.
Symbol: ${symbol}
Aktueller Preis: ${price.toFixed(2)} USDT
Letzte Candles (15min): ${candleSummary}

Technische Indikatoren (berechnet aus letzten 15min-Daten):
- RSI (14): ${typeof rsi === 'number' ? rsi.toFixed(2) : rsi}
- MACD (12,26,9): ${typeof macd === 'number' ? macd.toFixed(2) : macd} (Signal: ${typeof macdSignal === 'number' ? macdSignal.toFixed(2) : macdSignal})
- Stochastik (14,3,3): %K: ${typeof stochK === 'number' ? stochK.toFixed(2) : stochK}, %D: ${typeof stochD === 'number' ? stochD.toFixed(2) : stochD}
- Volumen: ${volume}

Analysiere:
- Ist der Markt überkauft (RSI > 70) oder überverkauft (RSI < 30)?
- Gibt es einen Bullish/Bearish-Crossover bei MACD oder Stochastik?
- Ist das Volumen stark genug, um den Trend zu bestätigen?
- Ist der aktuelle Preis sinnvoll für LONG/SHORT/HOLD?

Entscheide: LONG, SHORT oder HOLD.
Antworte NUR im folgenden JSON-Format:
{
  "action": "...",
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
        console.error(`❌ Kein gültiges JSON für ${symbol}`);
        continue;
      }

      const decision = JSON.parse(jsonMatch[0]);

      // Nur bei Signal (nicht HOLD) E-Mail senden
      if (decision.action && decision.action !== 'HOLD') {
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
        console.log(`✅ Qwenny: Signal gesendet: ${decision.action} ${symbol}`);
      } else {
        console.log(`➡️ Qwenny: Kein Signal für ${symbol} – HOLD`);
      }
    } catch (error) {
      console.error(`💥 Qwenny: Fehler bei ${symbol}:`, error.message);
    }
  }

  console.log(`✅ Qwenny: Multi-Symbol-Zyklus abgeschlossen`);
}

// Startfunktion
function startTradingBot() {
  tradingCycle(); // Sofort starten
  setInterval(tradingCycle, 60_000); // Alle 60 Sekunden
}