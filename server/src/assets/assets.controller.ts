import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type JwtPayload } from '../auth/jwt-auth.guard';
import { AssetsService } from './assets.service';
import { CreateAssetUploadDto } from './dto/create-asset-upload.dto';

@ApiTags('Assets')
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.assetsService.findAll(user.sub);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('uploads')
  createUpload(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateAssetUploadDto,
  ) {
    return this.assetsService.createUpload(user.sub, body);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/complete')
  completeUpload(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assetsService.completeUpload(user.sub, id);
  }

  @Get(':id/url')
  getDownloadUrl(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assetsService.getDownloadUrl(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.assetsService.remove(user.sub, id);
  }
}
