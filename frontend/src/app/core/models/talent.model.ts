export type TalentTier = 'Nòng cốt' | 'Tiềm năng' | 'Kế thừa';
export type ReadinessLevel = 'Ready Now' | 'Ready in 1 Year' | 'Ready in 2 Years';
export type PotentialLevel = 'Very High' | 'High' | 'Medium' | 'Low';

export interface Talent {
  id: string;
  fullName: string;
  position: string;
  department: string;
  talentTier: TalentTier;
  potentialLevel: PotentialLevel;
  /** 0–100 */
  performanceScore: number;
  /** 0–100 */
  potentialScore: number;
  /** 0–100: ≥60 High, 30–59 Medium, <30 Low */
  riskScore: number;
  yearsOfExperience: number;
  readinessLevel: ReadinessLevel;
  email: string;
}

export interface TalentListResponse {
  data: Talent[];
  total: number;
}
