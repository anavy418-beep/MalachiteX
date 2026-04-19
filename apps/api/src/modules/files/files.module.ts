import { Module } from "@nestjs/common";
import { LocalStorageService } from "@/common/storage/local-storage.service";
import { AuditModule } from "@/modules/audit/audit.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [AuditModule],
  controllers: [FilesController],
  providers: [FilesService, LocalStorageService],
  exports: [FilesService],
})
export class FilesModule {}
