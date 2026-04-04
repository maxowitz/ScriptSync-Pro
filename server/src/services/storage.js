const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

// ---------------------------------------------------------------------------
// Adapter detection: use Cloudflare R2 when credentials are present,
// otherwise fall back to local filesystem storage.
// ---------------------------------------------------------------------------

const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID);

// ---------------------------------------------------------------------------
// Cloudflare R2 adapter (S3-compatible)
// ---------------------------------------------------------------------------

let s3 = null;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'scriptsync';

if (useR2) {
  s3 = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// ---------------------------------------------------------------------------
// Local filesystem adapter
// ---------------------------------------------------------------------------

const LOCAL_ROOT = path.resolve(
  process.env.LOCAL_STORAGE_PATH || './storage'
);

function ensureLocalDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function localFullPath(key) {
  return path.join(LOCAL_ROOT, key);
}

// ---------------------------------------------------------------------------
// generatePresignedUploadUrl(key, contentType, expiresIn?)
//
// R2:    Returns an S3 presigned PUT URL.
// Local: Returns a localhost URL that the client can PUT to.
//        NOTE: You must serve the static upload endpoint yourself, e.g.:
//          app.put('/storage/*', uploadHandler);
// ---------------------------------------------------------------------------

async function generatePresignedUploadUrl(key, contentType, expiresIn = 3600) {
  if (useR2) {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn });
    return { url, key };
  }

  // Local fallback — the client will PUT directly to the dev server.
  // The route that handles this PUT should write the body to LOCAL_ROOT/key.
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/storage/${key}`;
  return { url, key };
}

// ---------------------------------------------------------------------------
// generatePresignedDownloadUrl(key, expiresIn?)
//
// R2:    Returns an S3 presigned GET URL.
// Local: Returns a localhost static file URL.
//        NOTE: Serve the storage directory as static files, e.g.:
//          app.use('/storage', express.static(LOCAL_ROOT));
// ---------------------------------------------------------------------------

async function generatePresignedDownloadUrl(key, expiresIn = 3600) {
  if (useR2) {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    return getSignedUrl(s3, command, { expiresIn });
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}/storage/${key}`;
}

// ---------------------------------------------------------------------------
// deleteObject(key)
// ---------------------------------------------------------------------------

async function deleteObject(key) {
  if (useR2) {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    await s3.send(command);
    return;
  }

  const fullPath = localFullPath(key);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

// ---------------------------------------------------------------------------
// downloadToLocal(key, localPath)
//
// Streams the object from storage to a local file path. Useful for feeding
// media files into transcription workers that need local filesystem access.
// ---------------------------------------------------------------------------

async function downloadToLocal(key, localPath) {
  if (useR2) {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await s3.send(command);
    ensureLocalDir(localPath);
    const writeStream = fs.createWriteStream(localPath);
    await pipeline(response.Body, writeStream);
    return;
  }

  // Local adapter — just copy the file
  const srcPath = localFullPath(key);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Local storage file not found: ${srcPath}`);
  }
  ensureLocalDir(localPath);
  fs.copyFileSync(srcPath, localPath);
}

// ---------------------------------------------------------------------------
// getStorageType()
// ---------------------------------------------------------------------------

function getStorageType() {
  return useR2 ? 'r2' : 'local';
}

module.exports = {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteObject,
  downloadToLocal,
  getStorageType,
};
