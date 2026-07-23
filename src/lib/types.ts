export interface Subject {
  id: number;
  name: string;
  category: string | null;
  openingCount: number;
  recovered: number;
  issued: number;
  damaged: number;
  lost: number;
  notes: string | null;
  averageCondition: number;
  degradationRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Incident {
  id: number;
  type: string;
  date: Date;
  subjectId: number | null;
  subject?: Subject | null;
  bookTitle: string;
  condition: string | null;
  comment: string | null;
  reportedBy: string | null;
  responsibleParty: string | null;
  studentClass: string | null;
  actionTaken: string | null;
  createdAt: Date;
}

export interface AuditLog {
  id: number;
  subjectId: number;
  subject?: Subject;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string | null;
  changedAt: Date;
}

export interface Checkout {
  id: number;
  subjectId: number;
  subject?: Subject;
  studentName: string;
  studentClass: string | null;
  checkoutDate: Date;
  dueDate: Date;
  returnDate: Date | null;
  status: string;
  conditionOut: number;
  conditionIn: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BorrowingRule {
  id: number;
  roleOrGrade: string;
  maxBooksAllowed: number;
  borrowDurationDays: number;
  finePerDay: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ClearanceRecord {
  timestamp: string;
  school: {
    name: string;
    motto?: string | null;
    logoPath?: string | null;
    address?: string | null;
    contactPhone?: string | null;
    academicYear?: string | null;
  };
  student: {
    studentName: string;
    studentClass?: string | null;
  };
  status: 'CLEARED' | 'HOLD';
  activeCheckouts: Checkout[];
  incidents: Incident[];
  unresolvedIncidents: Incident[];
  totalReplacementCharges: number;
  clearanceDecision: string;
}

export interface StockAuditItem {
  id: number;
  auditId: number;
  subjectId: number;
  subject?: Subject;
  expectedCount: number;
  actualCount: number;
  discrepancy: number;
  notes?: string | null;
}

export interface StockAuditSummary {
  totalSubjects: number;
  totalExpected: number;
  totalActual: number;
  totalDiscrepancy: number;
  missingItems: number;
  misplacedItems: number;
}

export interface StockAudit {
  id: number;
  auditDate: Date | string;
  auditedBy?: string | null;
  notes?: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  items: StockAuditItem[];
  summary?: StockAuditSummary;
}

export interface ConditionDecayPoint {
  currentCondition: number;
  degradationRate: number;
  futureCheckouts: number;
  projectedCondition: number;
  remainingCheckouts: number;
}

export interface SubjectDecayProjection {
  subjectId: number;
  subjectName: string;
  category: string;
  averageCondition: number;
  degradationRate: number;
  remainingCheckouts: number;
  projections: ConditionDecayPoint[];
}

export interface ReplacementSubjectCost {
  subjectId: number;
  name: string;
  category: string;
  totalBooks: number;
  damagedCount: number;
  nearEndLifeCount: number;
  replacementCount: number;
  estimatedCost: number;
  averageCondition: number;
}

export interface ReplacementCategoryCost {
  category: string;
  cost: number;
}

export interface ReplacementCostAnalysis {
  subjects: ReplacementSubjectCost[];
  totalReplacementCost: number;
  totalDamaged: number;
  totalNearEndLife: number;
  categoryCosts: ReplacementCategoryCost[];
  unitCost: number;
}

export interface DepreciationAnalytics {
  decayProjections: SubjectDecayProjection[];
  replacementCostAnalysis: ReplacementCostAnalysis;
}

export interface MonthlyCirculationTrend {
  month: string;
  checkouts: number;
  returns: number;
}

export interface PeakBorrowingDay {
  day: string;
  count: number;
}

export interface PopularCategory {
  category: string;
  count: number;
}

export interface TopReader {
  studentName: string;
  studentClass: string | null;
  totalCheckouts: number;
}

export interface CirculationInsights {
  monthlyTrends: MonthlyCirculationTrend[];
  peakDays: PeakBorrowingDay[];
  popularCategories: PopularCategory[];
  topReaders: TopReader[];
}

export interface BackupConfig {
  autoBackupEnabled: boolean;
  autoBackupPath: string | null;
  autoBackupIntervalHours: number;
  lastAutoBackupAt: Date | string | null;
}

export interface BackupFileRecord {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: Date | string;
}

export interface LanSyncConfig {
  lanSyncEnabled: boolean;
  lanPort: number;
  lanPasscode: string;
  lastLanSyncAt: Date | string | null;
  localIp: string;
  isServerRunning: boolean;
}

export interface LanStatusResponse {
  isServerRunning: boolean;
  localIp: string;
  port: number;
  lanSyncEnabled: boolean;
  lastLanSyncAt: Date | string | null;
}

export interface LanSyncResult {
  success: boolean;
  syncedAt: string;
  mergedCounts?: {
    subjects?: number;
    checkouts?: number;
    incidents?: number;
    rules?: number;
  };
  error?: string;
}



