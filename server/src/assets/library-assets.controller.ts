import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryAssetsService } from './library-assets.service';

@ApiTags('Library Assets')
@UseGuards(JwtAuthGuard)
@Controller('library-assets')
export class LibraryAssetsController {
  constructor(private readonly libraryAssetsService: LibraryAssetsService) {}

  @Get()
  findAll() {
    return this.libraryAssetsService.findAll();
  }

  @Get('legacy/:nodeType')
  findByLegacyNodeType(@Param('nodeType') nodeType: string) {
    return this.libraryAssetsService.findByLegacyNodeType(nodeType);
  }

  @Get(':id/url')
  getDownloadUrl(@Param('id') id: string) {
    return this.libraryAssetsService.getDownloadUrl(id);
  }
}
