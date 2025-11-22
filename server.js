// server.js – Qwenny – Multi-Symbol KI-Handelsbot mit Daily Cache + 15min → 1h/4h + 1d → 1w Trends, Alpha-Arena-Prompt, Telegram, Confidence 75%
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
app.listen(PORT, '0.0.0