import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DOWNLOAD_EXPIRY_SECONDS,
  UPLOAD_EXPIRY_SECONDS,
  type AllowedAssetMimeType,
} from './assets.constants';

export interface StoredObjectDetails {
  size: number;
  contentType: string | undefined;
  metadata: Record<string, string>;
  signature: Uint8Array;
}

@Injectable()
export class S3AssetsStorage {
  private clientInstance: S3Client | undefined;

  private get bucket(): string {
    const bucket = process.env.AWS_S3_ASSETS_BUCKET?.trim();
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Asset uploads are not configured (AWS_S3_ASSETS_BUCKET is missing)',
      );
    }
    return bucket;
  }

  private get client(): S3Client {
    if (this.clientInstance) return this.clientInstance;

    const region = process.env.AWS_REGION?.trim();
    if (!region) {
      throw new ServiceUnavailableException(
        'Asset uploads are not configured (AWS_REGION is missing)',
      );
    }

    this.clientInstance = new S3Client({ region });
    return this.clientInstance;
  }

  async createUpload(input: {
    key: string;
    assetId: string;
    ownerId: string;
    mimeType: AllowedAssetMimeType;
    maxBytes: number;
  }) {
    return createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: input.key,
      Expires: UPLOAD_EXPIRY_SECONDS,
      Fields: {
        'Content-Type': input.mimeType,
        'Cache-Control': 'private, max-age=3600',
        success_action_status: '204',
        'x-amz-meta-asset-id': input.assetId,
        'x-amz-meta-owner-id': input.ownerId,
      },
      Conditions: [
        ['content-length-range', 1, input.maxBytes],
        ['eq', '$Content-Type', input.mimeType],
        ['eq', '$Cache-Control', 'private, max-age=3600'],
        ['eq', '$success_action_status', '204'],
        ['eq', '$x-amz-meta-asset-id', input.assetId],
        ['eq', '$x-amz-meta-owner-id', input.ownerId],
      ],
    });
  }

  async inspect(key: string): Promise<StoredObjectDetails> {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // The first 64 KiB is enough to verify magic bytes and find ordinary
        // JPEG/WebP dimension headers without downloading the whole image.
        Range: 'bytes=0-65535',
      }),
    );
    const signature = object.Body
      ? await object.Body.transformToByteArray()
      : new Uint8Array();

    return {
      size: head.ContentLength ?? 0,
      contentType: head.ContentType,
      metadata: head.Metadata ?? {},
      signature,
    };
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: `${this.bucket}/${sourceKey}`,
        MetadataDirective: 'COPY',
      }),
    );
  }

  async putLibraryObject(input: {
    key: string;
    body: Uint8Array;
    mimeType: string;
    slug: string;
    version: number;
    checksum: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.mimeType,
        CacheControl: 'private, max-age=31536000, immutable',
        Metadata: {
          'library-asset-slug': input.slug,
          version: String(input.version),
          checksum: input.checksum,
        },
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      if (batch.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
  }

  async createDownloadUrl(key: string): Promise<{
    url: string;
    expiresAt: string;
  }> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: DOWNLOAD_EXPIRY_SECONDS },
    );

    return {
      url,
      expiresAt: new Date(
        Date.now() + DOWNLOAD_EXPIRY_SECONDS * 1000,
      ).toISOString(),
    };
  }
}
