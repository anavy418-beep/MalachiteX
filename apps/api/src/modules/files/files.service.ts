import { Injectable } from "@nestjs/common";
import { LocalStorageService } from "@/common/storage/local-storage.service";

@Injectable()
export class FilesService {
  constructor(private readonly storage: LocalStorageService) {}

  upload(file: Express.Multer.File, folder?: string) {
    return this.storage.save(file.buffer, file.originalname, folder);
  }
}
