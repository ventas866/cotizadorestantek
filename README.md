# ESTANTEK Cotizador — Cloudflare

## Arquitectura
```
index.html (Cloudflare Pages)  →  Worker (Cloudflare)  →  Supabase
```

---

## PASO 1 — Desplegar el Worker (backend)

### Opción A: Dashboard (sin instalar nada) ✅ Recomendada

1. Ir a **https://dash.cloudflare.com** → login
2. Menú izquierdo → **Workers & Pages → Create**
3. Click en **"Create Worker"**
4. Borrar el código de ejemplo, pegar todo el contenido de `worker.js`
5. Click **"Save and Deploy"**
6. Anotar la URL que aparece, ej: `https://estantek-cotizador-api.tunombre.workers.dev`

### Agregar variables secretas al Worker
En el Worker recién creado → **Settings → Variables → Environment Variables**:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | service_role key de Supabase |

Marcar ambas como **"Encrypt"** → **Save and Deploy**

---

## PASO 2 — Actualizar la URL del API en index.html

Abrir `index.html` con cualquier editor de texto (Bloc de notas funciona).

Buscar esta línea:
```
const API = 'https://estantek-cotizador-api.YOUR_SUBDOMAIN.workers.dev';
```

Reemplazar `YOUR_SUBDOMAIN` con tu subdominio real de Cloudflare.
Ejemplo:
```
const API = 'https://estantek-cotizador-api.nicolas123.workers.dev';
```

Guardar el archivo.

---

## PASO 3 — Desplegar el frontend (Cloudflare Pages)

1. En Cloudflare Dashboard → **Workers & Pages → Create**
2. Click en **"Pages"** tab → **"Upload assets"**
3. Nombre del proyecto: `estantek-cotizador`
4. Arrastrar SOLO el archivo `index.html`
5. Click **"Deploy site"**
6. URL quedará: `https://estantek-cotizador.pages.dev`

---

## PASO 4 — Verificar

1. Abrir `https://estantek-cotizador.pages.dev`
2. El punto en el header debe estar **verde**
3. Número debe mostrar **COT-2421**
4. Crear cotización de prueba → verificar historial en nube

---

## Archivos
```
estantek-cloudflare/
├── index.html     ← Frontend (subir a Cloudflare Pages)
├── worker.js      ← Backend  (subir a Cloudflare Workers)
├── wrangler.toml  ← Config (solo si usas CLI)
└── README.md
```

## Dominio propio (opcional)
En Cloudflare Pages → Custom domains → `cotizador.estantek.co`
En Cloudflare Worker → Settings → Triggers → `api.estantek.co/cotizaciones`
