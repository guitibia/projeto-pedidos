const https = require('https');

const DELIVERY_FEE_BRL  = 10.00;
const DELIVERY_RADIUS_KM = 2.5;

// Endereço base — geocodificado uma vez na inicialização
const HOME = { address: process.env.HOME_ADDRESS || '', lat: null, lng: null };

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nominatim(address) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`;
    const req = https.get(url, {
      headers: { 'User-Agent': `SistemaPedidos/1.0 (${process.env.HOME_EMAIL || 'admin'})`, 'Accept-Language': 'pt-BR' }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const list = JSON.parse(raw);
          if (list.length) resolve({ lat: parseFloat(list[0].lat), lng: parseFloat(list[0].lon) });
          else resolve(null);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

async function initHome() {
  if (HOME.lat) return HOME;
  const coords = await nominatim(HOME.address);
  if (coords) {
    HOME.lat = coords.lat;
    HOME.lng = coords.lng;
    console.log(`🏠 Base geocodificada: ${HOME.lat.toFixed(5)}, ${HOME.lng.toFixed(5)}`);
  } else {
    console.warn('⚠️  Não foi possível geocodificar o endereço base.');
  }
  return HOME;
}

async function geocodeClient(address, houseNumber, neighborhood, city = 'São João da Boa Vista') {
  // Remove parênteses e conteúdo extra que confunde o Nominatim
  const cleanNeighborhood = neighborhood.replace(/\s*\(.*?\)/g, '').trim();
  // Tenta com bairro primeiro, depois só rua + cidade
  const full = `${address}, ${houseNumber}, ${cleanNeighborhood}, ${city}, SP`;
  const result = await nominatim(full);
  if (result) return result;
  // Fallback sem bairro
  return nominatim(`${address}, ${houseNumber}, ${city}, SP`);
}

async function deliveryFee(clientLat, clientLng) {
  const home = await initHome();
  if (!home.lat || !clientLat || !clientLng) return 0;
  const dist = haversine(home.lat, home.lng, parseFloat(clientLat), parseFloat(clientLng));
  return dist > DELIVERY_RADIUS_KM ? DELIVERY_FEE_BRL : 0;
}

// Inicializa assincronamente ao carregar o módulo
initHome().catch(() => {});

module.exports = { geocodeClient, deliveryFee, haversine, DELIVERY_FEE_BRL, DELIVERY_RADIUS_KM };
