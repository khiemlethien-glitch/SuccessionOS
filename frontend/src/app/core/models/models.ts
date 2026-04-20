export type TalentTier = 'Nòng cốt' | 'Tiềm năng' | 'Kế thừa';
export type ReadinessLevel = 'Ready Now' | 'Ready in 1 Year' | 'Ready in 2 Years';
export type PotentialLevel = 'Very High' | 'High' | 'Medium' | 'Low';
export type RiskLevel = 'High' | 'Medium' | 'Low';
export type CriticalLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Talent {
  id: string;
  fullName: string;
  position: string;
  department: string;
  talentTier: TalentTier;
  potentialLevel: PotentialLevel;
  performanceScore: number;
  potentialScore: number;
  riskScore: number;
  yearsOfExperience: number;
  readinessLevel: ReadinessLevel;
  email: string;
  competencies?: { technical: number; leadership: number; communication: number; problemSolving: number; adaptability: number };
  competencyTargets?: { technical: number; performance: number; behavior: number; potential: number; leadership: number };
  hireDate?: string;
  tenureYears?: number;
  ktpProgress?: number;
  overallScore?: number;
  mentor?: string | null;
  targetPosition?: string;
  riskReasons?: string[];
  riskFactors?: RiskFactor[];
}

export interface RiskFactor {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  source: string;
  date: string;
}
export interface TalentListResponse { data: Talent[]; total: number; }

export interface KeyPosition {
  id: string; title: string; department: string; currentHolder: string;
  successorCount: number; readyNowCount: number;
  riskLevel: RiskLevel; criticalLevel: CriticalLevel;
  successors: string[];
  requiredCompetencies: string[];
}
export interface PositionListResponse { data: KeyPosition[]; total: number; }

export interface Successor {
  talentId: string; talentName: string;
  readiness: ReadinessLevel; priority: number; gapScore: number;
}
export interface SuccessionPlan {
  id: string; positionId: string; positionTitle: string; department: string;
  successors: Successor[];
}
export interface SuccessionPlanListResponse { data: SuccessionPlan[]; total: number; }

export interface IdpGoal {
  id: string; title: string; category: string; type: string;
  deadline: string; status: string; progress: number; mentor: string | null;
}
export interface IdpPlan {
  id: string; talentId: string; talentName: string;
  year: number; status: string; overallProgress: number; goals: IdpGoal[];
}
export interface IdpListResponse { data: IdpPlan[]; total: number; }

export interface AssessmentScores {
  technical: number; leadership: number; communication: number; strategicThinking: number;
}
export interface Assessment {
  id: string; talentId: string; talentName: string;
  period: string; assessorCount: number; scores: AssessmentScores;
  overallScore: number; status: string;
}
export interface AssessmentListResponse { data: Assessment[]; total: number; }

export interface MentoringPair {
  id: string; mentorId: string; mentorName: string; menteeId: string; menteeName: string;
  focus: string; startDate: string; endDate: string; status: string;
  sessionsCompleted: number; sessionsTotal: number; nextSession: string | null;
}
export interface MentoringListResponse { data: MentoringPair[]; total: number; }

export interface CalibrationEntry {
  talentId: string; performanceBefore: number; performanceAfter: number;
  potentialBefore: number; potentialAfter: number; box: number; notes: string;
}
export interface CalibrationSession {
  id: string; title: string; facilitator: string; date: string;
  status: string; locked: boolean; participants: string[]; calibrations: CalibrationEntry[];
}
export interface CalibrationListResponse { data: CalibrationSession[]; total: number; }

export interface AuditLog {
  id: string; timestamp: string; actor: string; action: string;
  entity: string; entityId: string | null; description: string; module: string;
}
export interface AuditLogListResponse { data: AuditLog[]; total: number; }

export interface AppModule {
  id: string; name: string; description: string; category: string;
  icon: string; status: 'active' | 'available' | 'coming'; version: string; price: string;
}
export interface ModuleListResponse { data: AppModule[]; total: number; }
