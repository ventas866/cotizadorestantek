// ================================================================
// ESTANTEK Cotizador — Cloudflare Worker
// Variables de entorno (en Cloudflare Dashboard > Settings > Variables):
//   SUPABASE_URL         → URL del proyecto Supabase
//   SUPABASE_SERVICE_KEY → service_role key de Supabase
//   PRICES_SHEET_URL     → URL de exportación CSV del Google Sheet de precios
//                          Formato: https://docs.google.com/spreadsheets/d/ID/gviz/tq?tqx=out:csv&sheet=Precios
// ================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function supabase(env, method, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase error ${res.status}`);
  return data;
}

// ================================================================
// PRECIOS — Google Sheets CSV
// ================================================================

// Cache por instancia de Worker (se reinicia con cada nuevo deploy)
let _preciosCache = null;
let _preciosCacheTime = 0;
const PRECIOS_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function handlePrecios(env) {
  const now = Date.now();
  if (_preciosCache && (now - _preciosCacheTime) < PRECIOS_TTL_MS) {
    return json(_preciosCache);
  }

  const sheetUrl = env.PRICES_SHEET_URL;
  if (!sheetUrl) {
    return json({
      error: 'PRICES_SHEET_URL no configurado.',
      hint: 'Agrega la variable en Cloudflare Dashboard → Workers → Settings → Variables.',
    }, 500);
  }

  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`Error ${res.status} al leer Google Sheets`);

  const csv = await res.text();
  const precios = parsePreciosCSV(csv);

  _preciosCache = precios;
  _preciosCacheTime = now;
  return json(precios);
}

// Estructura esperada del CSV (primera fila = encabezados):
// tipo,categoria,descripcion,largo_m,prof_m,precio_cop
//
// tipo      : TORRE | VIGA | ENTREPANO | OTRO
// categoria : SEMIPESADA | PESADA | ECONOMICA | PREMIUM | GALVANIZADO | PROTECTOR | …
// descripcion: texto libre (no se usa en código)
// largo_m   : 2.00 | 2.40 | 2.80 | 3.00 | 3.20
// prof_m    : 0.60 | 0.80 | 1.00 | 1.20  (solo para TORRE y ENTREPANO)
// precio_cop: número entero en pesos colombianos

function parsePreciosCSV(csv) {
  const lines = csv.trim().split('\n').filter(l => l.trim());
  const result = { torres: {}, vigas: {}, entrepanos: {}, otros: {} };
  if (lines.length < 2) return result;

  lines.slice(1).forEach(line => {
    const [tipo, cat, _desc, largo, prof, precioRaw] = parseCsvLine(line);
    const precio = parseInt((precioRaw || '').replace(/[^\d]/g, '')) || 0;
    if (!tipo || !precio) return;

    const t = tipo.trim().toUpperCase();
    const c = (cat || '').trim().toUpperCase();
    const l = (largo || '').trim();
    const p = (prof || '').trim();

    if (t === 'TORRE') {
      if (!result.torres[c]) result.torres[c] = {};
      if (!result.torres[c][l]) result.torres[c][l] = {};
      result.torres[c][l][p] = precio;
    } else if (t === 'VIGA') {
      if (!result.vigas[c]) result.vigas[c] = {};
      result.vigas[c][l] = precio;
    } else if (t === 'ENTREPANO') {
      if (!result.entrepanos[c]) result.entrepanos[c] = {};
      if (!result.entrepanos[c][l]) result.entrepanos[c][l] = {};
      result.entrepanos[c][l][p] = precio;
    } else if (t === 'OTRO') {
      result.otros[c] = precio;
    }
  });

  return result;
}

function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur.trim());
  return fields;
}

// ================================================================
// RENDER — fal.ai (flux/schnell)
// ================================================================

function buildRenderPrompt(body) {
  const tipo      = (body.tipo || 'SEMIPESADA').toUpperCase();
  const torre     = parseFloat(body.torre) || 2.4;
  const largo     = parseFloat(body.largo) || 2.4;
  const prof      = parseFloat(body.prof)  || 0.6;
  const niveles   = parseInt(body.niveles) || 3;
  const entrepano = (body.entrepano || 'ECONOMICA').toUpperCase();

  const tipoDesc = tipo === 'PESADA' ? 'heavy-duty industrial' : 'medium-duty industrial';
  const entDesc  = {
    ECONOMICA:  'light pine wood shelf panels',
    PREMIUM:    'premium dark wood shelf panels',
    GALVANIZADO:'perforated galvanized steel shelf panels',
  }[entrepano] || 'wooden shelf panels';

  return (
    `Professional studio product photograph of a ${tipoDesc} metal storage shelving rack, ` +
    `${torre}m tall, ${largo}m wide, ${prof}m deep, ${niveles} shelf levels, ${entDesc}, ` +
    `royal blue powder-coated steel upright columns, bright orange horizontal beams and connectors, ` +
    `clean white background, soft diffused studio lighting, photorealistic product photo, ` +
    `no text, no people, no watermarks, warehouse industrial shelving unit`
  );
}

async function handleRender(env, request) {
  if (!env.FAL_API_KEY) {
    return json({
      error: 'FAL_API_KEY no configurado.',
      hint: 'Agrégalo en Cloudflare Dashboard → Workers → Settings → Variables como secreto.',
    }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const prompt = buildRenderPrompt(body);

  const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${env.FAL_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size:            'landscape_4_3',
      num_inference_steps:   4,
      num_images:            1,
      enable_safety_checker: false,
    }),
  });

  if (!falRes.ok) {
    const errText = await falRes.text().catch(() => '');
    throw new Error(`fal.ai ${falRes.status}: ${errText.slice(0, 200)}`);
  }

  const falData = await falRes.json();
  const imageUrl = falData.images?.[0]?.url;
  if (!imageUrl) throw new Error('fal.ai no devolvió imagen');

  return json({ imageUrl, prompt });
}

// ================================================================
// MAIN HANDLER
// ================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      // ── GET /api/precios ──────────────────────────────────
      if (url.pathname === '/api/precios') {
        if (method !== 'GET') return json({ error: 'Método no permitido' }, 405);
        return await handlePrecios(env);
      }

      // ── POST /api/render ───────────────────────────────────
      if (url.pathname === '/api/render') {
        if (method !== 'POST') return json({ error: 'Método no permitido' }, 405);
        return await handleRender(env, request);
      }

      // ── GET /api/cotizaciones (o /) ───────────────────────
      if (method === 'GET') {
        const fields = [
          'id','numero','cliente','empresa','total','fecha_creacion',
          'productos','validez','forma_pago','tiempo_entrega','notas',
          'ciudad','telefono','email','descripcion','subtotal','iva_total',
          'render_url',
        ].join(',');

        const data = await supabase(
          env, 'GET',
          `cotizaciones?select=${fields}&order=numero.desc&limit=200`
        );

        const maxNum = data.length > 0
          ? Math.max(...data.map(c => c.numero))
          : 2420;
        const siguiente = Math.max(maxNum + 1, 2421);

        return json({ cotizaciones: data, siguiente });
      }

      // ── POST /api/cotizaciones ────────────────────────────
      if (method === 'POST') {
        const body = await request.json();

        const existing = await supabase(
          env, 'GET',
          `cotizaciones?select=numero&numero=eq.${body.numero}&limit=1`
        );

        if (existing.length > 0) {
          const maxData = await supabase(
            env, 'GET',
            'cotizaciones?select=numero&order=numero.desc&limit=1'
          );
          const nextNum = maxData.length > 0 ? maxData[0].numero + 1 : 2421;
          return json({ error: 'numero_duplicado', siguiente: nextNum }, 409);
        }

        const insertPayload = {
          numero:         body.numero,
          cliente:        body.cliente,
          empresa:        body.empresa        || null,
          telefono:       body.telefono       || null,
          ciudad:         body.ciudad         || null,
          email:          body.email          || null,
          descripcion:    body.descripcion    || null,
          productos:      body.productos,
          subtotal:       body.subtotal,
          iva_total:      body.iva_total,
          total:          body.total,
          validez:        body.validez,
          forma_pago:     body.forma_pago,
          tiempo_entrega: body.tiempo_entrega,
          notas:          body.notas          || null,
        };
        // render_url es opcional — solo se guarda si el cliente tiene la columna en Supabase
        // SQL: ALTER TABLE cotizaciones ADD COLUMN render_url TEXT;
        if (body.render_url) insertPayload.render_url = body.render_url;

        const inserted = await supabase(env, 'POST', 'cotizaciones', insertPayload);

        const cotizacion = Array.isArray(inserted) ? inserted[0] : inserted;
        return json({ cotizacion }, 201);
      }

      // ── DELETE /api/cotizaciones?id=xxx ───────────────────
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'id requerido' }, 400);
        await supabase(env, 'DELETE', `cotizaciones?id=eq.${id}`);
        return json({ ok: true });
      }

      return json({ error: 'Método no permitido' }, 405);

    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  },
};
