# REGPOL CALLAO — Documentación Técnica

**Región Policial del Callao — UNITIC**  
Versión 1.0 — 23 de junio de 2026  
Ing. Anthony Ccayo — UNITIC — 2026

> Para ver el PDF: ábrelo con el visor del sistema (doble clic en el Explorador de archivos o clic derecho → *Abrir con* → Edge/Adobe). Cursor no puede mostrar archivos PDF en el editor de texto.

---

## 1. Resumen del proyecto

REGPOL Callao es el portal web y sistema de gestión institucional de la Región Policial del Callao (UNITIC).

Incluye: portal público informativo, evaluaciones psicológicas MMPI-2, gestión de convenios y cursos, sorteos, CMS del portal y paneles administrativos por rol.

- **Repositorio:** https://github.com/ANTHONY109823/REGPOL_CALLAO

---

## 2. Arquitectura

Modelo híbrido desacoplado:

| Capa | Tecnología | Despliegue |
|------|------------|------------|
| Frontend | HTML, CSS, JS (`public/`) | GitHub Pages |
| Backend | Node.js + Express | Railway |
| Base de datos | PostgreSQL | Railway (`DATABASE_URL`) |

**URLs de producción:**

- Portal web: GitHub Pages (rama `main`)
- API backend: `https://regpolcallao-production.up.railway.app`

`public/api-config.js` detecta localhost vs producción y apunta al backend correcto.

Health check: `GET /health` (Railway).

---

## 3. Stack tecnológico

- **Backend:** Node.js ≥ 18, Express 4.x, `pg`, `cors`, `pdfkit`
- **Frontend:** HTML5, CSS3, JavaScript vanilla
- **Iconos:** Font Awesome 6 (CDN)
- **PDF evaluaciones:** `pdf_gen.js` + `mmpi2_score.py`
- **CI/CD:** GitHub Actions → GitHub Pages; Railway → `node server.js`

---

## 4. Base de datos — PostgreSQL

Motor: **PostgreSQL**. Conexión vía `DATABASE_URL` con SSL en producción.

Inicialización en `initDB()` al arrancar `server.js`. Sin migraciones externas.

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `admins` | Usuarios del panel (SHA-256, rol, permisos JSONB) |
| `preguntas` | 566 ítems MMPI-2 |
| `evaluaciones` | Tests enviados/parciales (respuestas JSONB, CIP único) |
| `progresos` | Borradores sin enviar |
| `divisiones` | DIVOPUS 1, 2, 3, DIVUES |
| `unidades_pol` | Comisarías y unidades |
| `configuracion` | KV (p. ej. `unidades_activas`) |
| `items_portal` | Convocatorias convenios/cursos |
| `inscripciones` | Inscripciones a convocatorias |
| `sorteos_portal` / `resultados_sorteo` | Sorteos y ganadores |
| `portal_configuracion` | CMS (novedades, carrusel, reseña…) |

**Índices:** `idx_eval_comisaria`, `idx_eval_unidad`

---

## 5. Roles y autenticación

- Login: `POST /admin/login` → token en `localStorage` (`regpol_session`)
- Cabecera API: `x-admin-token`
- Cache de sesión servidor: 5 minutos

| Rol | Acceso |
|-----|--------|
| `unitic` | Super Admin — todo el sistema |
| `bienestar` | Evaluaciones amplias |
| `usuario` | Por permisos JSONB |

**Permisos:** `evaluaciones`, `descargas`, `cms_cursos`, `cms_convenios`, `cms_inicio`, `cms_resena`, `cms_labor`, `cms_novedades`

**Paneles:** `panel-admin.html` o `panel-usuario.html`

---

## 6. Módulos funcionales

- **Portal público** (`index.html`, `portal.js`)
- **Evaluación MMPI-2** (`evaluacion.html`, `evaluacion.js`)
- **Panel admin** (`panel-admin.html`)
- **Panel usuario** (`panel-usuario.html`)
- **Sorteo en vivo** (`sorteo-live.html`)

---

## 7. API REST — Endpoints principales

### Públicos

`GET` `/health`, `/config`, `/preguntas`, `/progreso`, `/portal/configuracion`, `/portal/items`, `/portal/sorteos`, `/unidades-publico`  
`POST` `/guardar`, `/progreso`, `/portal/items/:id/inscribir`, `/admin/login`

### Autenticados (`x-admin-token`)

- **Evaluaciones:** `GET /evaluaciones`, `/stats`, `/listar`, `/descargar`, `/admin/avances`, `/admin/registro-cip`
- **Eliminar:** `DELETE /admin/evaluaciones/:id`, `/admin/progresos?cip=`, `/admin/evaluaciones-lote`
- **PDF:** `GET /pdf/efectivo`, `/pdf/grupo`, `/admin/preview-resultado`, `/admin/preview-avance`
- **Admin:** `/admin/stats-sistema`, `/admin/stats-gestion`, CRUD preguntas/usuarios/divisiones/items/sorteos/inscripciones

---

## 8. Flujo evaluaciones MMPI-2

1. Efectivo ingresa CIP en `evaluacion.html`
2. `POST /progreso` guarda borrador en `progresos`
3. `POST /guardar` guarda en `evaluaciones` y borra progreso si completada
4. Un CIP = un registro en `evaluaciones`
5. Admin lista, filtra, genera PDF
6. Eliminación: individual, por unidad o total (Super Admin + confirmación `ELIMINAR`)

---

## 9. Estructura de archivos

| Archivo | Rol |
|---------|-----|
| `server.js` | Servidor, BD, endpoints |
| `pdf_gen.js` | PDFs MMPI-2 |
| `preguntas_data.json` | Seed 566 preguntas |
| `public/panel-admin.html` | Panel principal |
| `public/api-config.js` | URL backend |
| `railway.json` | Deploy Railway |
| `.github/workflows/deploy-pages.yml` | Deploy Pages |

---

## 10. Variables de entorno

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto (default 3000) |
| `DATABASE_URL` | PostgreSQL (obligatoria en producción) |

---

## 11. Optimizaciones recientes

- Dashboard Super Admin con resumen general (`/admin/stats-sistema`)
- Cache stats 45 s / config 120 s
- Código legacy eliminado
- DELETE evaluaciones y avances
- Migraciones inline en `progresos`

---

## 12. Seguridad

- Contraseñas admin: SHA-256
- Sesiones del panel con token aleatorio opaco (no contiene credenciales); expira a las 12 h de inactividad
- Tokens por cabecera `x-admin-token`
- Límite de intentos de login por IP (10 fallos / 10 min)
- Compresión gzip y cabecera `X-Content-Type-Options: nosniff`
- Filtro por unidad para operadores restringidos
- CORS para GitHub Pages
- Contraseñas seed configurables por variables de entorno en Railway:
  `SEED_PASS_UNITIC`, `SEED_PASS_PSICOLOGIA`, `SEED_PASS_CONVENIOS`, `SEED_PASS_EDUCACION`, `SEED_PASS_IMAGEN`
  (solo aplican al crear la cuenta; las existentes se cambian desde el panel → Usuarios)
- IMPORTANTE: cambiar las contraseñas por defecto de las 5 cuentas desde el panel tras el despliegue

---

*Regenerar PDF: `node scripts/gen-documentacion-pdf.js`*
