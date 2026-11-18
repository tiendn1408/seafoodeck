import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  }),
  bucket = process.env.S3_BUCKET ?? 'seafoodeck-private';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const mode = process.argv[2],
    dir = process.env.BACKUP_DIR;
  if (!dir || !['backup', 'restore', 'inventory'].includes(mode))
    throw Error('BACKUP_DIR and backup|restore|inventory are required.');
  await mkdir(dir, { recursive: true });
  if (mode === 'restore') {
    const manifest: { key: string; file: string; sha256: string; mime: string }[] = JSON.parse(
      await readFile(path.join(dir, 'objects.json'), 'utf8'),
    );
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    for (const row of manifest) {
      if (!row.key.startsWith('o/') || row.key.includes('..') || !/^\d+\.bin$/.test(row.file))
        throw Error('Invalid backup key/path.');
      const bytes = await readFile(path.join(dir, row.file));
      if (digest(bytes) !== row.sha256) throw Error('Backup checksum mismatch.');
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: row.key, Body: bytes, ContentType: row.mime }),
      );
    }
    console.log(JSON.stringify({ restoredObjects: manifest.length }));
    return;
  }
  const manifest: { key: string; file: string; sha256: string; mime: string }[] = [];
  let continuation: string | undefined;
  do {
    const list = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuation }),
    );
    for (const entry of list.Contents ?? []) {
      if (!entry.Key) continue;
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.Key }));
      const bytes = await object.Body!.transformToByteArray(),
        file = `${manifest.length}.bin`;
      if (mode === 'backup') await writeFile(path.join(dir, file), bytes, { mode: 0o600 });
      manifest.push({
        key: entry.Key,
        file,
        sha256: digest(bytes),
        mime: object.ContentType ?? 'application/octet-stream',
      });
    }
    continuation = list.NextContinuationToken;
  } while (continuation);
  await writeFile(path.join(dir, 'objects.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify({ objects: manifest.length, mode }));
}
main().catch(() => {
  console.error(
    'Object backup/restore failed; inspect private backup files and storage configuration.',
  );
  process.exit(1);
});
