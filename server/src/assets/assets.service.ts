import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Asset } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { detectAssetMimeType, readAssetDimensions } from './asset-signature';
import {
  ASSET_STATUS,
  DEFAULT_MAX_ASSET_BYTES,
  DEFAULT_USER_ASSET_QUOTA_BYTES,
  MAX_ASSET_DIMENSION,
  extensionForMimeType,
  isAllowedAssetMimeType,
} from './assets.constants';
import type { CreateAssetUploadDto } from './dto/create-asset-upload.dto';
import { S3AssetsStorage } from './s3-assets.storage';

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3AssetsStorage,
  ) {}

  private positiveIntegerFromEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private get maxAssetBytes(): number {
    return this.positiveIntegerFromEnv(
      'ASSET_MAX_FILE_BYTES',
      DEFAULT_MAX_ASSET_BYTES,
    );
  }

  private get userQuotaBytes(): number {
    return this.positiveIntegerFromEnv(
      'ASSET_USER_QUOTA_BYTES',
      DEFAULT_USER_ASSET_QUOTA_BYTES,
    );
  }

  private async withDownloadUrl(asset: Asset) {
    const download = await this.storage.createDownloadUrl(asset.storageKey);
    return {
      id: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      downloadUrl: download.url,
      downloadUrlExpiresAt: download.expiresAt,
    };
  }

  async createUpload(userId: string, input: CreateAssetUploadDto) {
    if (!isAllowedAssetMimeType(input.mimeType)) {
      throw new BadRequestException('Only PNG, JPEG, and WebP are supported');
    }
    if (input.size > this.maxAssetBytes) {
      throw new PayloadTooLargeException(
        `Image must be no larger than ${this.maxAssetBytes} bytes`,
      );
    }

    // A browser can close after creating an intent. Expire its database
    // reservation after an hour; S3's pending/ lifecycle clears any object.
    await this.prisma.asset.deleteMany({
      where: {
        ownerId: userId,
        status: ASSET_STATUS.uploading,
        createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    const aggregate = await this.prisma.asset.aggregate({
      where: {
        ownerId: userId,
        status: { in: [ASSET_STATUS.uploading, ASSET_STATUS.active] },
      },
      _sum: { size: true },
    });
    if ((aggregate._sum.size ?? 0) + input.size > this.userQuotaBytes) {
      throw new PayloadTooLargeException('Your upload storage quota is full');
    }

    const assetId = randomUUID();
    const extension = extensionForMimeType(input.mimeType);
    const pendingKey = `pending/${userId}/${assetId}.${extension}`;
    const name = input.fileName.trim().slice(0, 255) || `image.${extension}`;

    const asset = await this.prisma.asset.create({
      data: {
        id: assetId,
        ownerId: userId,
        name,
        storageKey: pendingKey,
        mimeType: input.mimeType,
        size: input.size,
        width: input.width,
        height: input.height,
        status: ASSET_STATUS.uploading,
      },
    });

    try {
      const upload = await this.storage.createUpload({
        key: pendingKey,
        assetId,
        ownerId: userId,
        mimeType: input.mimeType,
        maxBytes: this.maxAssetBytes,
      });
      return {
        assetId: asset.id,
        uploadUrl: upload.url,
        fields: upload.fields,
        expiresIn: 300,
      };
    } catch (error) {
      await this.prisma.asset
        .delete({ where: { id: asset.id } })
        .catch(() => {});
      throw error;
    }
  }

  async completeUpload(userId: string, assetId: string) {
    const asset = await this.findOwned(userId, assetId);
    if (asset.status === ASSET_STATUS.active) {
      return this.withDownloadUrl(asset);
    }

    try {
      const stored = await this.storage.inspect(asset.storageKey);
      const detectedMimeType = detectAssetMimeType(stored.signature);
      const dimensions = detectedMimeType
        ? readAssetDimensions(stored.signature, detectedMimeType)
        : null;
      const metadataMatches =
        stored.metadata['asset-id'] === asset.id &&
        stored.metadata['owner-id'] === userId;

      if (
        stored.size !== asset.size ||
        stored.size > this.maxAssetBytes ||
        stored.contentType !== asset.mimeType ||
        detectedMimeType !== asset.mimeType ||
        !dimensions ||
        dimensions.width < 1 ||
        dimensions.height < 1 ||
        dimensions.width > MAX_ASSET_DIMENSION ||
        dimensions.height > MAX_ASSET_DIMENSION ||
        !metadataMatches
      ) {
        throw new BadRequestException(
          'Uploaded object does not match the requested image',
        );
      }

      const mimeType = detectedMimeType;
      const finalKey = `users/${userId}/assets/${asset.id}.${extensionForMimeType(mimeType)}`;
      await this.storage.copy(asset.storageKey, finalKey);
      const active = await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          storageKey: finalKey,
          mimeType,
          size: stored.size,
          width: dimensions.width,
          height: dimensions.height,
          status: ASSET_STATUS.active,
        },
      });
      await this.storage.delete(asset.storageKey).catch((error: unknown) => {
        this.logger.warn(
          `Could not remove pending S3 object for asset ${asset.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      return this.withDownloadUrl(active);
    } catch (error) {
      if (error instanceof BadRequestException) {
        await Promise.allSettled([
          this.storage.delete(asset.storageKey),
          this.prisma.asset.delete({ where: { id: asset.id } }),
        ]);
      }
      throw error;
    }
  }

  async findAll(userId: string) {
    const assets = await this.prisma.asset.findMany({
      where: { ownerId: userId, status: ASSET_STATUS.active },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(assets.map((asset) => this.withDownloadUrl(asset)));
  }

  async getDownloadUrl(userId: string, assetId: string) {
    const asset = await this.findOwned(userId, assetId, ASSET_STATUS.active);
    return this.storage.createDownloadUrl(asset.storageKey);
  }

  async remove(userId: string, assetId: string) {
    const asset = await this.findOwned(userId, assetId);
    await this.storage.delete(asset.storageKey);
    await this.prisma.asset.delete({ where: { id: asset.id } });
    return { deleted: true };
  }

  async removeAllForUser(userId: string): Promise<void> {
    const assets = await this.prisma.asset.findMany({
      where: { ownerId: userId },
      select: { storageKey: true },
    });
    if (assets.length > 0) {
      await this.storage.deleteMany(assets.map((asset) => asset.storageKey));
      await this.prisma.asset.deleteMany({ where: { ownerId: userId } });
    }
  }

  private async findOwned(
    userId: string,
    assetId: string,
    status?: string,
  ): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ownerId: userId, ...(status ? { status } : {}) },
    });
    if (!asset) throw new NotFoundException('Image asset not found');
    return asset;
  }
}
