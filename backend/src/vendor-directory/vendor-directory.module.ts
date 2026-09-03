import { Module } from '@nestjs/common';
import { VendorDirectoryController } from './vendor-directory.controller';

@Module({
  controllers: [VendorDirectoryController],
})
export class VendorDirectoryModule {}
