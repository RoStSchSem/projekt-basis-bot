// server.js – Projekt Basis Bot (Render-kompatibel)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

const app = express();
const PORT = process.env.PORT || 10000;

// Health-Check für Render
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Starte HTTP-Server (Render erkennt Port 10000)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Render: HTTP-Server läuft auf Port ${PORT}`);
  console.log('🤖 Autonomer Trading-Bot wird gestartet...');
  startTradingBot();
});

// Resend-E-Mail senden
async function sendEmail(subject, text) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Basis Bot <onboarding@resend.dev>',
      to: ['deepseek-tradingbot@rossem.de'], // 🔁 Deine E-Mail
      subject: subject,
      text: text
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
    });
    console.log('✅ E-Mail gesendet');
  } catch (error) {
    console.error('📧 Resend-Fehler:', error.message);
  }
}

// Globale Flag für Startup-Test
let hasSentStartupEmail = false;

// Autonomer Trading-Zyklus
async function tradingCycle() {
  const symbol = 'BTCUSDT';
  console.log(`\n🔄 Trading-Zyklus gestartet für ${symbol} – ${new Date().toISOString()}`);

  // 1. Bitget-Daten holen
  const price = await getSpotPrice(symbol);
  const candles = await getCandles(symbol, '15min', 5);

  if (price === null || candles.length === 0) {
    console.warn('⚠️ Keine Bitget-Daten – überspringe Zyklus');
    return;
  }

  // 2. Einmalige Startup-Test-E-Mail
  if (!hasSentStartupEmail) {
    await sendEmail(
      `✅ Render-Start bestätigt: Basis Bot läuft`,
      `Preis: ${price}\nZeit: ${new Date().toISOString()}\nStatus: OK – E-Mail-System funktioniert!`
    );
    hasSentStartupEmail = true;
    console.log('📧 Startup-Test-E-Mail gesendet');
  }

  // 3. Deepseek befragen
  const candleSummary = candles.slice(-3).map(c => `C:${c.close.toFixed(2)}`).join(', ');
  const prompt = `
Du bist ein professioneller Krypto-Trader.
Symbol: ${symbol}
Aktueller Preis: ${price.toFixed(2)} USDT
Letzte Candles (15min): ${candleSummary}
Entscheide: LONG, SHORT oder HOLD.
Antworte NUR im folgenden JSON-Format:
{"action":"...","confidence":0.0,"reason":"..."}
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
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const raw = deepseekRes.data.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[^{}]*\}/);
    if (!jsonMatch) {
      console.error('❌ Kein gültiges JSON in Deepseek-Antwort');
      return;
    }

    const decision = JSON.parse(jsonMatch[0]);

    // 4. Nur bei echtem Signal E-Mail senden
    if (decision.action && decision.action !== 'HOLD') {
      const subject = `🚨 Signal: ${decision.action} ${symbol}`;
      const text = `
Preis: ${price.toFixed(2)} USDT
Confidence: ${(decision.confidence * 100).toFixed(1)}%
Grund: ${decision.reason || '—'}

Datenquelle: Bitget Spot API
Zeit: ${new Date().toISOString()}
      `.trim();

      await sendEmail(subject, text);
      console.log(`✅ Signal gesendet: ${decision.action}`);
    }
  } catch (error) {
    console.error('💥 Deepseek-Fehler:', error.message);
  }
}

// Startfunktion
function startTradingBot() {
  tradingCycle(); // Sofort starten
  setInterval(tradingCycle, 60_000); // Alle 60 Sekunden
}