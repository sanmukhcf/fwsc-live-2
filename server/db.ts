import fs from 'fs';
import path from 'path';
import type { AuditResult, AuditJob, AuditHistoryItem } from '../src/types';

// Determine writable data directory safely for local, Docker, and serverless (e.g. Vercel)
function resolveDataDir(): string {
  // If explicitly on Vercel or AWS Lambda, /tmp is guaranteed writable
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return path.join('/tmp', 'fwsc_data');
  }

  const defaultDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(defaultDir, '.write_test');
    fs.writeFileSync(testFile, '1');
    fs.unlinkSync(testFile);
    return defaultDir;
  } catch (err) {
    // Read-only filesystem detected (e.g. Lambda container /var/task), fallback to /tmp
    return path.join('/tmp', 'fwsc_data');
  }
}

const DATA_DIR = resolveDataDir();
const AUDITS_FILE = path.join(DATA_DIR, 'audits_index.json');
const AUDITS_RECORDS_DIR = path.join(DATA_DIR, 'records');

// In-memory caches and active jobs (always guaranteed to work regardless of filesystem)
const activeJobs = new Map<string, AuditJob>();
const auditCache = new Map<string, AuditResult>();

function ensureDataDirectories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(AUDITS_RECORDS_DIR)) {
      fs.mkdirSync(AUDITS_RECORDS_DIR, { recursive: true });
    }
    if (!fs.existsSync(AUDITS_FILE)) {
      fs.writeFileSync(AUDITS_FILE, JSON.stringify([]), 'utf-8');
    }
  } catch (err) {
    // Non-fatal if filesystem is restricted; memory cache will continue working
    console.warn('Filesystem access limited, operating in-memory:', (err as any)?.message);
  }
}

try {
  ensureDataDirectories();
} catch {
  // Silent fallback
}

export class AuditRepository {
  // Save completed audit
  static async saveAudit(audit: AuditResult): Promise<void> {
    ensureDataDirectories();
    auditCache.set(audit.id, audit);

    // Save full record to disk safely
    try {
      const recordPath = path.join(AUDITS_RECORDS_DIR, `${audit.id}.json`);
      fs.writeFileSync(recordPath, JSON.stringify(audit, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Could not persist record to disk, kept in memory:', (err as any)?.message);
    }

    // Update index safely
    try {
      const historyList = await this.listAudits();
      const existingIndex = historyList.findIndex(h => h.id === audit.id);

      const historyItem: AuditHistoryItem = {
        id: audit.id,
        websiteUrl: audit.websiteUrl,
        createdAt: audit.createdAt,
        pagesCrawled: audit.pagesCrawledCount,
        score: audit.scores.overall,
        scoreStatus: audit.scores.status,
        criticalIssues: audit.issueCounts.critical,
        warnings: audit.issueCounts.warning,
      };

      if (existingIndex >= 0) {
        historyList[existingIndex] = historyItem;
      } else {
        historyList.unshift(historyItem);
      }

      // Keep top 100 in index
      const trimmedIndex = historyList.slice(0, 100);
      fs.writeFileSync(AUDITS_FILE, JSON.stringify(trimmedIndex, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Could not update audits index file:', (err as any)?.message);
    }
  }

  // Get full audit by ID
  static async getAudit(id: string): Promise<AuditResult | null> {
    if (auditCache.has(id)) {
      return auditCache.get(id)!;
    }

    const recordPath = path.join(AUDITS_RECORDS_DIR, `${id}.json`);
    if (fs.existsSync(recordPath)) {
      try {
        const data = fs.readFileSync(recordPath, 'utf-8');
        const parsed = JSON.parse(data) as AuditResult;
        auditCache.set(id, parsed);
        return parsed;
      } catch (err) {
        console.error(`Failed to read audit record ${id}:`, err);
        return null;
      }
    }
    return null;
  }

  // List all previous audits
  static async listAudits(): Promise<AuditHistoryItem[]> {
    ensureDataDirectories();
    try {
      if (fs.existsSync(AUDITS_FILE)) {
        const content = fs.readFileSync(AUDITS_FILE, 'utf-8');
        return JSON.parse(content) as AuditHistoryItem[];
      }
    } catch (err) {
      console.error('Failed to read audits index:', err);
    }
    return [];
  }

  // Delete an audit
  static async deleteAudit(id: string): Promise<boolean> {
    ensureDataDirectories();
    auditCache.delete(id);
    const recordPath = path.join(AUDITS_RECORDS_DIR, `${id}.json`);
    if (fs.existsSync(recordPath)) {
      fs.unlinkSync(recordPath);
    }

    const historyList = await this.listAudits();
    const updated = historyList.filter(h => h.id !== id);
    fs.writeFileSync(AUDITS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return true;
  }

  // Active Job management
  static createJob(job: AuditJob): void {
    activeJobs.set(job.id, job);
  }

  static getJob(id: string): AuditJob | undefined {
    return activeJobs.get(id);
  }

  static updateJob(id: string, updates: Partial<AuditJob>): void {
    const job = activeJobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }
}
