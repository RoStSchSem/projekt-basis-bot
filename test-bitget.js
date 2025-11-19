const { getSpotPrice, getCandles } = require('./bitgetClient');

async function test() {
  console.log('🔍 Teste Bitget mit BTCUSDT und 15min...');
  const price = await getSpotPrice('BTCUSDT');
  console.log('✅ Preis:', price);

  const candles = await getCandles('BTCUSDT', '15min', 5);
  console.log('✅ Anzahl Candles:', candles.length);
  if (candles.length > 0) {
    console.log('Letzte Candle:', candles[0]);
  }
}

test();