import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { readFile, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { AuthSession, MediaAsset, Prisma } from './generated/prisma/client';
import { Db } from './db';
import { Catalog } from './catalog';
import { hash } from './security';
export interface MediaInfo {
  source: string;
  credit: string;
  rights: string;
  role: string;
  nameKind?: string;
  aiGenerated: boolean;
  originalImageId?: string;
  locale?: string;
  voice?: string;
  spokenLabel?: string;
  readingConvention?: string;
}
sharp.concurrency(1);
sharp.cache({ memory: 16 });
@Injectable()
export class Media {
  private client(publicUrl = false) {
    return new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: publicUrl
        ? (process.env.S3_PUBLIC_ENDPOINT ?? process.env.PUBLIC_ORIGIN)
        : process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    });
  }
  get bucket() {
    return process.env.S3_BUCKET ?? 'seafoodeck-private';
  }
  constructor(
    private db: Db,
    private catalog: Catalog,
  ) {}
  async initialize() {
    try {
      await this.client().send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client().send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
  private uploading = false;
  async upload(path: string, info: MediaInfo) {
    if (this.uploading)
      throw new HttpException('Đang xử lý một file khác; thử lại sau ít giây.', 429);
    this.uploading = true;
    try {
      return await this.performUpload(path, info);
    } finally {
      this.uploading = false;
    }
  }
  private async performUpload(path: string, info: MediaInfo) {
    if (
      !['profile', 'identification', 'product', 'pronunciation', 'illustration'].includes(
        info.role,
      ) ||
      ['source', 'credit', 'rights'].some(
        (k) =>
          typeof info[k as keyof MediaInfo] !== 'string' ||
          !(info[k as keyof MediaInfo] as string).trim() ||
          (info[k as keyof MediaInfo] as string).length > 3000,
      )
    )
      throw new BadRequestException('Cần vai trò, nguồn, tác giả và quyền sử dụng.');
    if (info.aiGenerated && info.role === 'identification')
      throw new BadRequestException('AI không được dùng nhận diện chấm điểm.');
    const size = (await stat(path)).size,
      audio = info.role === 'pronunciation';
    if (
      size >
      Number(
        audio
          ? (process.env.AUDIO_MAX_BYTES ?? 5242880)
          : (process.env.IMAGE_MAX_BYTES ?? 10485760),
      )
    )
      throw new BadRequestException('File vượt giới hạn.');
    if (audio && !['en', 'ja', 'scientific'].includes(info.nameKind ?? ''))
      throw new BadRequestException('Cần chỉ rõ ngôn ngữ bản thu.');
    const bytes = await readFile(path); // Bounded by Multer/file limits above; no unbounded buffering.
    const id = randomUUID(),
      prefix = `o/${randomUUID()}`,
      sha = hash(bytes);
    let mime: string,
      originalKey: string,
      deliveryKey: string,
      thumbnailKey: string | null = null,
      delivered: Buffer,
      thumb: Buffer | undefined;
    if (audio) {
      if (!(
        bytes.subarray(0, 3).toString() === 'ID3' ||
        (bytes[0] === 255 && (bytes[1] & 224) === 224)
      ))
        throw new BadRequestException('Cần MP3 có signature hợp lệ.');
      try {
        const { stdout } = await promisify(execFile)(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,codec_type:format=duration',
            '-of',
            'json',
            path,
          ],
          { timeout: 8000, maxBuffer: 100000 },
        );
        const parsed = JSON.parse(stdout);
        if (
          !parsed.streams?.length ||
          parsed.streams.some(
            (s: { codec_name: string; codec_type: string }) =>
              s.codec_type !== 'audio' || s.codec_name !== 'mp3',
          ) ||
          !(Number(parsed.format.duration) > 0 && Number(parsed.format.duration) <= 180)
        )
          throw Error();
      } catch {
        throw new BadRequestException('Không giải mã được MP3 hoặc bản thu dài quá 180 giây.');
      }
      mime = 'audio/mpeg';
      originalKey = `${prefix}/source.mp3`;
      deliveryKey = `${prefix}/audio.mp3`;
      const normalizedPath = `/tmp/seafoodeck-upload/${id}.mp3`;
      try {
        await promisify(execFile)(
          'ffmpeg',
          [
            '-v',
            'error',
            '-y',
            '-i',
            path,
            '-map_metadata',
            '-1',
            '-vn',
            '-c:a',
            'copy',
            normalizedPath,
          ],
          { timeout: 8000, maxBuffer: 100000 },
        );
        delivered = await readFile(normalizedPath);
      } finally {
        await discard(normalizedPath);
      }
    } else {
      try {
        const image = sharp(path, {
          limitInputPixels: Number(process.env.IMAGE_MAX_PIXELS ?? 25000000),
          failOn: 'error',
        });
        const meta = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
          throw Error();
        delivered = await image
          .rotate()
          .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 86 })
          .toBuffer();
        thumb = await sharp(delivered)
          .resize({ width: 480, height: 360, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toBuffer();
        originalKey = `${prefix}/source.${meta.format}`;
        deliveryKey = `${prefix}/quiz.jpg`;
        thumbnailKey = `${prefix}/thumb.jpg`;
        mime = 'image/jpeg';
      } catch {
        throw new BadRequestException(
          'Ảnh không hợp lệ, bị lỗi hoặc vượt 25 MP; chỉ nhận JPEG/PNG/WebP tĩnh.',
        );
      }
    }
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: originalKey,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: audio ? mime : 'application/octet-stream',
      }),
    );
    if (originalKey !== deliveryKey)
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: deliveryKey,
          Body: delivered,
          ContentType: mime,
        }),
      );
    if (thumbnailKey && thumb)
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: thumbnailKey,
          Body: thumb,
          ContentType: mime,
        }),
      );
    return this.db.mediaAsset.create({
      data: {
        id,
        originalKey,
        deliveryKey,
        thumbnailKey,
        hash: sha,
        mime,
        bytes: size,
        role: info.role,
        nameKind: info.nameKind,
        aiGenerated: info.aiGenerated,
        metadata: info as unknown as Prisma.InputJsonValue,
      },
    });
  }
  async url(asset: MediaAsset, thumbnail = false) {
    if (asset.revokedAt) throw new NotFoundException('Media đã thu hồi.');
    return {
      url: await getSignedUrl(
        this.client(true),
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: thumbnail && asset.thumbnailKey ? asset.thumbnailKey : asset.deliveryKey,
        }),
        { expiresIn: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 120) },
      ),
      expiresIn: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 120),
    };
  }
  async authorized(actor: AuthSession, id: string, thumbnail = false) {
    const asset = await this.db.mediaAsset.findUnique({
      where: { id },
      include: { links: { include: { revision: { include: { releases: true } } } } },
    });
    if (!asset || asset.revokedAt) throw new NotFoundException();
    if (!['editor', 'reviewer', 'publisher', 'admin'].includes(actor.role)) {
      const release = await this.catalog.current(actor);
      if (
        !asset.links.some((l) => l.revision.releases.some((r) => r.releaseId === release.id)) ||
        (!release.internal && asset.status !== 'approved')
      )
        throw new ForbiddenException();
    }
    const metadata = asset.metadata as unknown as MediaInfo;
    return {
      ...(await this.url(asset, thumbnail)),
      credit: metadata.credit,
      rights: metadata.rights,
      source: metadata.source,
    };
  }
  async cleanup(dryRun = true) {
    const inventory = await this.client().send(new ListObjectsV2Command({ Bucket: this.bucket }));
    const assets = await this.db.mediaAsset.findMany();
    const referenced = new Set(
      assets.flatMap((a) => [a.originalKey, a.deliveryKey, a.thumbnailKey].filter(Boolean)),
    );
    const orphaned = (inventory.Contents ?? []).filter(
      (o) =>
        o.Key &&
        !referenced.has(o.Key) &&
        o.LastModified &&
        o.LastModified.getTime() < Date.now() - 86400000,
    );
    if (!dryRun)
      for (const o of orphaned)
        await this.client().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: o.Key }));
    return {
      dryRun,
      orphaned: orphaned.map((o) => o.Key),
      truncated: inventory.IsTruncated ?? false,
    };
  }
}
export async function discard(path: string) {
  await unlink(path).catch(() => {});
}
