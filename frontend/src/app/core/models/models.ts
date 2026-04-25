// ── Enums / Literal types ─────────────────────────────────────────────────────
export type TalentTier    = 'Nòng cốt' | 'Tiềm năng' | 'Kế thừa';
export type ReadinessLevel = 'Ready Now' | 'Ready in 1 Year' | 'Ready in 2 Years';
export type PotentialLevel = 'Very High' | 'High' | 'Medium' | 'Low';
export type RiskLevel     = 'High' | 'Medium' | 'Low';
export type CriticalLevel = 'Critical' | 'High' | 'Medium' | 'Low';

// ── Talent / Employee ─────────────────────────────────────────────────────────
export interface Talent {
  id: string;
  full_name: string;
  position: string;
  department: string;
  department_id?: string;
  talent_tier: TalentTier;
  potential_level: PotentialLevel;
  performance_score: number | null;
  potential_score: number | null;
  risk_score: number | null;
  years_of_experience: number;
  readiness_level: ReadinessLevel;
  email: string;
  competencies?: {
    technical: number | null; leadership: number | null; communication: number | null;
    problem_solving: number | null; adaptability: number | null;
  };
  competency_targets?: {
    technical: number; performance: number; behavior: number;
    potential: number; leadership: number;
  };
  hire_date?: string;
  tenure_years?: number;
  ktp_progress?: number;
  overall_score?: number;
  mentor?: string | null;
  target_position?: string;
  risk_reasons?: string[];
  risk_factors?: RiskFactor[];
  departure_reasons?: string[];
}

export interface RiskFactor {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low' | 'ok';  // 'ok' = positive signal
  source: string;
  date: string;
}

export interface TalentListResponse   { data: Talent[];  total: number; }
export interface TalentDetailResponse { data: Talent; }

// ── Dashboard KPI ─────────────────────────────────────────────────────────────
export interface DashboardKpi {
  total_talents: number;
  tier_counts: {
    'Nòng cốt': number; 'Tiềm năng': number;
    'Kế thừa': number; 'Chưa phân bổ': number;
  };
  positions_with_successors: number;
  positions_no_successor: number;
  high_risk_talents: number;
  active_idps: number;
  avg_idp_progress: number;
  top_risk: Array<{ id: string; risk_score: number; risk_reasons: string[] }>;
}

// ── Career Review ─────────────────────────────────────────────────────────────
export interface CareerReviewCategory { label: string; weight: number; score: number; }
export interface CareerReview {
  period: string;
  categories: CareerReviewCategory[];
  overall: number;
  strengths: string[];
  needs_dev: string[];
  manager_note: string;
}
export interface CareerReviewResponse { data: CareerReview; }

// ── Current Project ───────────────────────────────────────────────────────────
export interface CurrentProject {
  name: string; type: string; role: string;
  client: string; value: string; status: string;
}
export interface CurrentProjectResponse { data: CurrentProject; }

// ── Knowledge Transfer ────────────────────────────────────────────────────────
export interface KnowledgeTransferItem { title: string; category: string; status: string; progress: number; }
export interface KnowledgeTransfer {
  successor: string; successor_role: string;
  start_date: string; target_date: string;
  overall_progress: number;
  items: KnowledgeTransferItem[];
}
export interface KnowledgeTransferResponse { data: KnowledgeTransfer; }

// ── Assessment 360° ───────────────────────────────────────────────────────────
export interface Assessment360Source   { label: string; pct: number; }
export interface Assessment360Criteria { label: string; score: number; }
export interface Assessment360 {
  overall: number; benchmark: number; period: string;
  sources: Assessment360Source[];
  criteria: Assessment360Criteria[];
  strengths: string[];
  needs_dev: string[];
  manager_note: string;
}
export interface Assessment360Response { data: Assessment360; }

// ── Key Position ──────────────────────────────────────────────────────────────
export interface KeyPosition {
  id: string; title: string; department: string; current_holder: string;
  successor_count: number; ready_now_count: number;
  risk_level: RiskLevel; critical_level: CriticalLevel;
  successors: string[];
  required_competencies: string[];
  competency_scores?: Record<string, number>;   // target score mỗi năng lực (0–100)
  parent_id?: string | null;
}
export interface PositionListResponse { data: KeyPosition[]; total: number; }

// ── Succession ────────────────────────────────────────────────────────────────
export interface Successor {
  talent_id: string; talent_name: string;
  readiness: ReadinessLevel; priority: number; gap_score: number;
}
export interface SuccessionPlan {
  id: string; position_id: string; position_title: string; department: string;
  successors: Successor[];
}
export interface SuccessionPlanListResponse { data: SuccessionPlan[]; total: number; }

// ── IDP ───────────────────────────────────────────────────────────────────────
export interface IdpGoal {
  id: string; title: string; category: string; type: string;
  deadline: string; status: string; progress: number; mentor: string | null;
}
export interface IdpPlan {
  id: string; talent_id: string; talent_name: string;
  year: number; status: string; overall_progress: number; goals: IdpGoal[];
  target_position?: string;
  approved_by?: string;
  approved_date?: string;
  goals_12m?: string[];
  goals_2to3y?: string[];
}
export interface IdpListResponse   { data: IdpPlan[]; total: number; }
export interface IdpDetailResponse { data: IdpPlan; }

// ── Assessment ────────────────────────────────────────────────────────────────
export interface AssessmentScores {
  technical: number; leadership: number; communication: number; strategic_thinking: number;
}
export interface Assessment {
  id: string; talent_id: string; talent_name: string;
  period: string; assessor_count: number; scores: AssessmentScores;
  overall_score: number; status: string;
}
export interface AssessmentListResponse   { data: Assessment[]; total: number; }
export interface AssessmentDetailResponse { data: Assessment; }

// ── Mentoring ─────────────────────────────────────────────────────────────────
export interface MentoringPair {
  id: string; mentor_id: string; mentor_name: string; mentee_id: string; mentee_name: string;
  focus: string; start_date: string; end_date: string; status: string;
  sessions_completed: number; sessions_total: number; next_session: string | null;
}
export interface MentoringListResponse { data: MentoringPair[]; total: number; }

// ── Calibration ───────────────────────────────────────────────────────────────
export interface CalibrationEntry {
  talent_id: string; performance_before: number; performance_after: number;
  potential_before: number; potential_after: number; box: number; notes: string;
}
export interface CalibrationSession {
  id: string; title: string; facilitator: string; date: string;
  status: string; locked: boolean; participants: string[]; calibrations: CalibrationEntry[];
}
export interface CalibrationListResponse { data: CalibrationSession[]; total: number; }

// ── Audit Log ─────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string; timestamp: string; actor: string; action: string;
  entity: string; entity_id: string | null; description: string; module: string;
}
export interface AuditLogListResponse { data: AuditLog[]; total: number; }

// ── Marketplace Module ────────────────────────────────────────────────────────
export interface AppModule {
  id: string; name: string; description: string; category: string;
  icon: string; status: 'active' | 'available' | 'coming'; version: string; price: string;
}
export interface ModuleListResponse { data: AppModule[]; total: number; }

// ── AI Insight ────────────────────────────────────────────────────────────────
export interface AiInsight { insight: string; }
