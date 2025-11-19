// server.js – Render-kompatibel: HTTP-Server + autonomer Bot
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { getSpotPrice, getCandles } = require('./bitgetClient');

const app = express();
const PORT = process.env.PORT || 10000; // Render erwartet 10000

// Health-Check für Render
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Starte HTTP-Server – Render erkennt den Port und hält den Prozess am Leben
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Render: HTTP-Server läuft auf Port ${PORT}`);
  console.log('🤖 Autonomer Trading-Bot wird gestartet...');
  startTradingBot();
});

// ===== Autonomer Trading-Bot =====
async function tradingCycle() {
  const symbol = 'BTCUSDT';
  console.log(`\n🔄 Trading-Zyklus gestartet für ${symbol} – ${new Date().toISOString()}`);

  const price = await getSpotPrice(symbol);
  const candles = await getCandles(symbol, '15min', 5);

  if (price === null || candles.length === 0) {
    console.warn('⚠️ Keine Bitget-Daten – überspringe Zyklus');
    return;
  }

  // Deepseek-Aufruf (optional – momentan nur HOLD)
  console.log(`✅ Preis: ${price}, Candles: ${candles.length}`);
}

function startTradingBot() {
  tradingCycle(); // Sofort starten
  setInterval(tradingCycle, 60_000); // Alle 60 Sekunden
}