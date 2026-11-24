export interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  fullPath: string;
  checksum: string;
  content: string;
}

export interface AppliedMigrationRecord {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

export interface MigrationSummaryItem {
  version: number;
  name: string;
  checksum: string;
  status: 'applied' | 'skipped';
}

export interface MigrationReport {
  appliedCount: number;
  skippedCount: number;
  totalMigrations: number;
  migrations: MigrationSummaryItem[];
}

export interface RunMigrationsOptions {
  migrationsDir?: string;
  targetRole?: string | null;
}
