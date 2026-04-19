import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StorageService } from "./storage.interface";

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly root = join(process.cwd(), "uploads");

  async save(fileBuffer: Buffer, originalName: string, folder = "general") {
    await fs.mkdir(join(this.root, folder), { recursive: true });

    const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
    const fileName = `${randomUUID()}.${ext}`;
    const filePath = join(this.root, folder, fileName);

    await fs.writeFile(filePath, fileBuffer);

    return {
      key: `${folder}/${fileName}`,
      url: `/uploads/${folder}/${fileName}`,
    };
  }
}
