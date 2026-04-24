// api/proxy.js
const https = require('https');
const fetch = require('node-fetch');

// Agente que ignora el certificado SSL incompleto de gargano.com.ar
const agent = new https.Agent({ rejectUnauthorized: false });

async function handler(req, res) {
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
  const contentType = req.headers['content-type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');

  try {
    let fetchOptions;

    if (isMultipart) {
      // Pasar el stream crudo con el Content-Type original (incluye el boundary)
      fetchOptions = {
        method: req.method,
        headers: {
          'Content-Type': contentType,
          'Accept': 'application/json',
        },
        body: req,
        agent,
      };
    } else {
      // Leer y parsear el body como JSON
      const rawBody = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      fetchOptions = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? (rawBody || null) : null,
        agent,
      };
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
    });
  }
}

// El config DEBE estar en la función, no antes de la asignación
handler.config = { api: { bodyParser: false } };

module.exports = handler;
