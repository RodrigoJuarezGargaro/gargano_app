// api/proxy.js
const https = require('https');
const fetch = require('node-fetch');

// Agente que ignora el certificado SSL incompleto de gargano.com.ar
const agent = new https.Agent({ rejectUnauthorized: false });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint } = req.query;
  if (!endpoint) {
    return res.status(400).json({ error: 'Falta el parametro endpoint' });
  }

  const targetUrl = `https://www.gargano.com.ar/laravel_backend_app/public/api/${endpoint}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : null,
      agent,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
    });
  }
};
