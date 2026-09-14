import { Injectable, NotFoundException } from '@nestjs/common';
import type { LibraryAsset } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3AssetsStorage } from './s3-assets.storage';

const ACTIVE_STATUS = 'active';

@Injectable()
export class LibraryAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3AssetsStorage,
  ) {}

  private async withDownloadUrl(asset: LibraryAsset) {
    const download = await this.storage.createDownloadUrl(asset.storageKey);
    return {
      id: asset.id,
      slug: asset.slug,
      name: asset.name,
      category: asset.category,
      paletteGroup: asset.paletteGroup,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      version: asset.version,
      sortOrder: asset.sortOrder,
      searchAliases: asset.searchAliases,
      legacyNodeType: asset.legacyNodeType,
      metadata: asset.metadata,
      downloadUrl: download.url,
      downloadUrlExpiresAt: download.expiresAt,
    };
  }

  async findAll() {
    const assets = await this.prisma.libraryAsset.findMany({
      where: { status: ACTIVE_STATUS },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(assets.map((asset) => this.withDownloadUrl(asset)));
  }

  async getDownloadUrl(id: string) {
    const asset = await this.findActive({ id });
    return this.withDownloadUrl(asset);
  }

  async findByLegacyNodeType(legacyNodeType: string) {
    const asset = await this.findActive({ legacyNodeType });
    return this.withDownloadUrl(asset);
  }

  private async findActive(where: { id: string } | { legacyNodeType: string }) {
    const asset = await this.prisma.libraryAsset.findFirst({
      where: { ...where, status: ACTIVE_STATUS },
    });
    if (!asset) throw new NotFoundException('Library asset not found');
    return asset;
  }
}
