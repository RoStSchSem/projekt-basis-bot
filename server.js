// server.js – Autonomer Bot mit Bitget + Deepseek + Resend
require('dotenv').config();
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

// Deine E-Mail – sicherstellen, dass sie korrekt ist!
const YOUR_EMAIL = 'deepseek-tradingbot@rossem.de';

// Resend-E-Mail senden
async function sendEmail(subject, text) {
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'bot@basis.de',
      to: [YOUR_EMAIL],
      subject: subject,
      text: text
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
    });
    console.log('✅ E-Mail gesendet an', YOUR_EMAIL);
  } catch (error) {
    console.error('📧 E-Mail-Fehler:', error.message);
  }
}

// Deepseek befragen
async function askDeepseek(symbol, price, candles) {
  const summary = candles.slice(-3).map(c => `C:${c.close}`).join(', ');
  const prompt = `
KI-Handelssystem.
Symbol: ${symbol}
Aktueller Preis: ${price}
Letzte Candles (15min): ${summary}
Entscheide: LONG, SHORT oder HOLD.
Antworte NUR als JSON:
{"action":"...","confidence":0.0,"reason":"..."}
`.trim();

  try {
    const res = await axios.post('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` }
    });

    const raw = res.data.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[^{}]*\}/);
    if (!jsonMatch) throw new Error('Kein gültiges JSON');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('🧠 Deepseek-Fehler:', err.message);
    return { action: 'HOLD', confidence: 0, reason: 'API-Fehler' };
  }
}

// Haupt-Zyklus
async function tradingCycle() {
  const symbol = 'BTCUSDT';
  console.log(`\n🔄 Starte Zyklus für ${symbol} – ${new Date().toISOString()}`);

  const price = await getSpotPrice(symbol);
  const candles = await getCandles(symbol, '15min', 5);

  if (price === null || candles.length === 0) {
    console.warn('⚠️ Keine Bitget-Daten – überspringe Zyklus');
    return;
  }

  const decision = await askDeepseek(symbol, price, candles);

  if (decision.action !== 'HOLD') {
    const text = `Preis: ${price}\nConfidence: ${(decision.confidence * 100).toFixed(1)}%\nGrund: ${decision.reason}`;
    await sendEmail(`🚨 Signal: ${decision.action} ${symbol}`, text);
  }

  console.log(`✅ Entscheidung: ${decision.action} | Preis: ${price} | Conf: ${(decision.confidence * 100).toFixed(1)}%`);
}

// Starte sofort und dann alle 60 Sekunden
tradingCycle();
setInterval(tradingCycle, 60_000);