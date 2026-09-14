import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { S3AssetsStorage } from './s3-assets.storage';
import { LibraryAssetsController } from './library-assets.controller';
import { LibraryAssetsService } from './library-assets.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssetsController, LibraryAssetsController],
  providers: [AssetsService, LibraryAssetsService, S3AssetsStorage],
  exports: [AssetsService],
})
export class AssetsModule {}
