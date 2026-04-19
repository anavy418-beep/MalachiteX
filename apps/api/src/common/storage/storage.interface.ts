export interface StorageService {
  save(fileBuffer: Buffer, originalName: string, folder?: string): Promise<{ key: string; url: string }>;
}
