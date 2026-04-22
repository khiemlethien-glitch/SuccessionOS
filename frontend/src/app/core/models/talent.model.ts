export type TalentTier = 'Nòng cốt' | 'Tiềm năng' | 'Kế thừa';
export type ReadinessLevel = 'Ready Now' | 'Ready in 1 Year' | 'Ready in 2 Years';
export type PotentialLevel = 'Very High' | 'High' | 'Medium' | 'Low';

export interface Talent {
  id: string;
  full_name: string;
  position: string;
  department: string;
  talent_tier: TalentTier;
  potential_level: PotentialLevel;
  /** 0–100 */
  performance_score: number;
  /** 0–100 */
  potential_score: number;
  /** 0–100: ≥60 High, 30–59 Medium, <30 Low */
  risk_score: number;
  years_of_experience: number;
  readiness_level: ReadinessLevel;
  email: string;
}

export interface TalentListResponse {
  data: Talent[];
  total: number;
}
