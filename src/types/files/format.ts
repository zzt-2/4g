export interface FileRecord {
  id: string;
  name: string;
  createTime: string;
  lastModified: string;
  isPublic: boolean;
  isOwner: boolean;
  path?: string;
}
