/**
 * Expedientes de convenios en Railway Buckets (S3).
 * Postgres solo guarda la clave (pdf_requisitos = 's3:...').
 * URL firmada de minutos; bucket privado. Nunca servir BYTEA nuevo.
 */
'use strict';

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_BYTES = 5 * 1024 * 1024;
const PRESIGN_SEC = 5 * 60;

function cfg() {
  return {
    bucket: process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || process.env.BUCKET || '',
    endpoint: process.env.AWS_ENDPOINT_URL || process.env.ENDPOINT || '',
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.REGION || 'auto',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || ''
  };
}

function usarPathStyle() {
  const v = String(process.env.AWS_S3_FORCE_PATH_STYLE || process.env.AWS_S3_URL_STYLE || '').toLowerCase();
  if (v === '1' || v === 'true' || v === 'path') return true;
  if (v === '0' || v === 'false' || v === 'virtual') return false;
  return false;
}

function configurado() {
  const c = cfg();
  return !!(c.bucket && c.endpoint && c.accessKeyId && c.secretAccessKey);
}

let client = null;
function getClient() {
  if (!configurado()) return null;
  if (client) return client;
  const c = cfg();
  client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey
    },
    forcePathStyle: usarPathStyle(),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  });
  return client;
}

function mesLimaAhora() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima' }).slice(0, 7);
}

function claveObjeto(itemId, inscripcionId, mes) {
  const m = String(mes || mesLimaAhora()).slice(0, 7);
  return 'expedientes/' + m + '/' + parseInt(itemId, 10) + '/' + parseInt(inscripcionId, 10) + '.pdf';
}

function esRefS3(ref) {
  return String(ref || '').indexOf('s3:') === 0;
}

function keyDesdeRef(ref) {
  return String(ref || '').slice(3);
}

function refDesdeKey(key) {
  return 's3:' + String(key || '');
}

function validarPdfBuffer(buf) {
  if (!buf || !buf.length) return 'Adjunte el PDF del expediente';
  if (buf.length > MAX_BYTES) return 'El PDF no debe superar 5 MB';
  if (buf.length < 5 || buf.slice(0, 4).toString('latin1') !== '%PDF') {
    return 'El archivo no es un PDF válido';
  }
  return '';
}

function bufferDesdeBase64(raw) {
  const s = String(raw || '');
  if (!s) return null;
  const b64 = s.indexOf('base64,') >= 0 ? s.split('base64,').pop() : s;
  try {
    const buf = Buffer.from(String(b64).replace(/\s/g, ''), 'base64');
    return buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

async function putBuffer(key, buf, nombre) {
  const s3 = getClient();
  if (!s3) throw new Error('Almacenamiento de expedientes no configurado (Railway Bucket).');
  const err = validarPdfBuffer(buf);
  if (err) throw new Error(err);
  await s3.send(new PutObjectCommand({
    Bucket: cfg().bucket,
    Key: key,
    Body: buf,
    ContentType: 'application/pdf',
    ContentLength: buf.length,
    Metadata: { nombre: String(nombre || 'expediente.pdf').slice(0, 180) }
  }));
}

async function presignPut(key) {
  const s3 = getClient();
  if (!s3) throw new Error('Almacenamiento de expedientes no configurado (Railway Bucket).');
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: cfg().bucket,
    Key: key,
    ContentType: 'application/pdf'
  }), { expiresIn: PRESIGN_SEC });
}

async function presignGet(key, nombre) {
  const s3 = getClient();
  if (!s3) throw new Error('Almacenamiento de expedientes no configurado (Railway Bucket).');
  const fn = String(nombre || 'expediente.pdf').replace(/"/g, '');
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: cfg().bucket,
    Key: key,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: 'inline; filename="' + fn + '"'
  }), { expiresIn: PRESIGN_SEC });
}

async function head(key) {
  const s3 = getClient();
  if (!s3) return null;
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: cfg().bucket, Key: key }));
  } catch (e) {
    const code = e && (e.name || e.Code || e.code);
    const st = e && e.$metadata && e.$metadata.httpStatusCode;
    if (code === 'NotFound' || code === 'NoSuchKey' || st === 404) return null;
    throw e;
  }
}

async function getBuffer(key) {
  const s3 = getClient();
  if (!s3) throw new Error('Almacenamiento de expedientes no configurado (Railway Bucket).');
  const out = await s3.send(new GetObjectCommand({ Bucket: cfg().bucket, Key: key }));
  const chunks = [];
  for await (const c of out.Body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function asegurarCors(origins) {
  const s3 = getClient();
  if (!s3) return { ok: false };
  const list = (origins || []).filter(Boolean);
  if (!list.length) {
    list.push('https://www.regionpolicialcallao.pe', 'https://regionpolicialcallao.pe');
  }
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: cfg().bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedOrigins: list,
          ExposeHeaders: ['ETag', 'Content-Length'],
          MaxAgeSeconds: 3600
        }]
      }
    }));
    return { ok: true };
  } catch (e) {
    console.warn('CORS bucket expedientes:', e && e.message);
    return { ok: false, error: e && e.message };
  }
}

module.exports = {
  MAX_BYTES,
  PRESIGN_SEC,
  configurado,
  cfg,
  mesLimaAhora,
  claveObjeto,
  esRefS3,
  keyDesdeRef,
  refDesdeKey,
  validarPdfBuffer,
  bufferDesdeBase64,
  putBuffer,
  presignPut,
  presignGet,
  head,
  getBuffer,
  asegurarCors
};
