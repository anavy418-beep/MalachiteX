import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CurrentUser, RequestUser } from "@/common/decorators/current-user.decorator";
import { AuditService } from "@/modules/audit/audit.service";
import { UploadFileDto } from "./dto/upload-file.dto";
import { FilesService } from "./files.service";

@Controller("files")
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly auditService: AuditService,
  ) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    const uploaded = await this.filesService.upload(file, dto.folder ?? "general");

    await this.auditService.log({
      actorId: user.userId,
      action: "FILE_UPLOADED",
      entityType: "StoredFile",
      entityId: uploaded.key,
      payload: {
        folder: dto.folder ?? "general",
        originalName: file.originalname,
      },
    });

    return uploaded;
  }
}
