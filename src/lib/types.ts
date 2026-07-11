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
