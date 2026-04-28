import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface MentoringPairFull {
  id: string;
  mentor_id: string;    mentor_name: string;    mentor_position: string;
  mentee_id: string;    mentee_name: string;    mentee_position: string;
  skills: string[];     skill_labels: string[];
  status: string;       initiated_by: string;
  start_date: string | null;   duration_months: number;   monthly_hours: number;
  goals: string | null;        justification: string | null;   reject_reason: string | null;
  created_at: string;
  // computed
  confirmed_hours: number;     // sum of confirmed sessions duration in hours
  sessions_count: number;
}

export interface MentoringSessionFull {
  id: string; pair_id: string; session_date: string; duration_minutes: number;
  title: string; mentee_notes: string | null; mentor_feedback: string | null;
  status: string; logged_by: string | null; confirmed_at: string | null; created_at: string;
}

export interface SkillScore {
  criterion_id: string; key: string; label: string;
  score: number; max_score: number; assessment_type: string;
}

export interface MentorSuggestion {
  employee_id: string; full_name: string; position: string; department: string;
  avg_gap_pct: number;   // average gap across selected skills
  skill_scores: { key: string; label: string; mentor_score: number; mentee_score: number; gap_pct: number }[];
  active_mentee_count: number;   // should be 0 to be eligible
}

// ── Mock data for demo (when DB is empty) ─────────────────────────────────────

const MOCK_PAIRS: MentoringPairFull[] = [
  {
    id: 'M001', mentor_id: 'E001', mentor_name: 'Nguyễn Minh Tuấn', mentor_position: 'Trưởng phòng Kỹ thuật',
    mentee_id: 'E002', mentee_name: 'Lê Thị Hoa', mentee_position: 'Kỹ sư Cao cấp',
    skills: ['leadership', 'strategic_thinking'], skill_labels: ['Lãnh đạo', 'Tư duy chiến lược'],
    status: 'active', initiated_by: 'mentee',
    start_date: '2026-01-15', duration_months: 6, monthly_hours: 8,
    goals: 'Phát triển kỹ năng lãnh đạo nhóm và tư duy chiến lược để chuẩn bị cho vị trí quản lý',
    justification: 'Nhân viên có tiềm năng cao, cần phát triển năng lực lãnh đạo',
    reject_reason: null, created_at: '2026-01-10T08:00:00Z',
    confirmed_hours: 10, sessions_count: 5,
  },
  {
    id: 'M002', mentor_id: 'E003', mentor_name: 'Trần Văn Hùng', mentor_position: 'Giám đốc Dự án',
    mentee_id: 'E004', mentee_name: 'Phạm Quốc Bảo', mentee_position: 'Kỹ sư Dự án',
    skills: ['project_management', 'communication'], skill_labels: ['Quản lý dự án', 'Giao tiếp'],
    status: 'active', initiated_by: 'lm',
    start_date: '2026-02-01', duration_months: 6, monthly_hours: 8,
    goals: 'Nâng cao kỹ năng quản lý dự án kỹ thuật và giao tiếp với đối tác',
    justification: 'LM đánh giá nhân viên cần phát triển kỹ năng quản lý dự án',
    reject_reason: null, created_at: '2026-01-25T10:00:00Z',
    confirmed_hours: 6, sessions_count: 3,
  },
  {
    id: 'M003', mentor_id: 'E005', mentor_name: 'Hoàng Thị Mai', mentor_position: 'CFO',
    mentee_id: 'E006', mentee_name: 'Vũ Đức Thắng', mentee_position: 'Chuyên viên Tài chính',
    skills: ['financial_analysis'], skill_labels: ['Phân tích tài chính'],
    status: 'pending_mentor', initiated_by: 'hr',
    start_date: null, duration_months: 6, monthly_hours: 8,
    goals: 'Nâng cao kỹ năng phân tích tài chính và financial modeling',
    justification: 'HR xác định nhân viên cần phát triển năng lực tài chính',
    reject_reason: null, created_at: '2026-04-01T09:00:00Z',
    confirmed_hours: 0, sessions_count: 0,
  },
];

const MOCK_SESSIONS: Record<string, MentoringSessionFull[]> = {
  'M001': [
    { id: 'S001', pair_id: 'M001', session_date: '2026-04-10', duration_minutes: 90,
      title: 'Thảo luận định hướng lãnh đạo chiến lược 3 năm tới',
      mentee_notes: 'Mentor chia sẻ kinh nghiệm thực tế trong quản lý nhóm đa chức năng',
      mentor_feedback: 'Mentee tiến bộ tốt, cần tập trung hơn vào kỹ năng ra quyết định',
      status: 'confirmed', logged_by: 'E002', confirmed_at: '2026-04-11T08:00:00Z', created_at: '2026-04-10T15:00:00Z' },
    { id: 'S002', pair_id: 'M001', session_date: '2026-03-27', duration_minutes: 60,
      title: 'Review kỹ năng trình bày và ra quyết định',
      mentee_notes: 'Thực hành presentation trước nhóm nhỏ',
      mentor_feedback: null,
      status: 'pending_confirm', logged_by: 'E002', confirmed_at: null, created_at: '2026-03-27T15:00:00Z' },
    { id: 'S003', pair_id: 'M001', session_date: '2026-03-13', duration_minutes: 60,
      title: 'Phân tích năng lực lãnh đạo qua 360°',
      mentee_notes: 'Review kết quả 360° và xây dựng kế hoạch cải thiện',
      mentor_feedback: 'Kết quả 360° rất tốt, cần tập trung vào stakeholder management',
      status: 'confirmed', logged_by: 'E002', confirmed_at: '2026-03-14T09:00:00Z', created_at: '2026-03-13T15:00:00Z' },
  ],
  'M002': [
    { id: 'S004', pair_id: 'M002', session_date: '2026-04-15', duration_minutes: 90,
      title: 'Review scope & timeline quản lý dự án kỹ thuật',
      mentee_notes: 'Thực hành WBS trên dự án thực tế',
      mentor_feedback: 'Tiến bộ tốt trong việc phân tích WBS',
      status: 'confirmed', logged_by: 'E004', confirmed_at: '2026-04-16T08:00:00Z', created_at: '2026-04-15T16:00:00Z' },
    { id: 'S005', pair_id: 'M002', session_date: '2026-03-31', duration_minutes: 60,
      title: 'Kỹ năng quản lý rủi ro kỹ thuật',
      mentee_notes: 'Xây dựng risk register mẫu cho dự án',
      mentor_feedback: null,
      status: 'pending_confirm', logged_by: 'E004', confirmed_at: null, created_at: '2026-03-31T16:00:00Z' },
  ],
};

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MentoringService {
  private sb = inject(SupabaseService).client;

  // ─────────────────────────────────────────────────────────────────────────────
  // Load pairs where current user is mentor or mentee
  // ─────────────────────────────────────────────────────────────────────────────
  async loadMyPairs(currentEmployeeId: string): Promise<MentoringPairFull[]> {
    const { data, error } = await this.sb
      .from('mentoring_pairs')
      .select('*')
      .or(`mentor_id.eq.${currentEmployeeId},mentee_id.eq.${currentEmployeeId}`)
      .in('status', ['active', 'pending_mentor', 'pending_lm', 'pending_hr', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MentoringService.loadMyPairs]', error);
      // Return mock data for demo when DB is empty or tables don't exist yet
      return MOCK_PAIRS;
    }
    if (!data || data.length === 0) return MOCK_PAIRS;

    return this._enrichPairs(data);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load ALL pairs (for HR/Admin management view)
  // ─────────────────────────────────────────────────────────────────────────────
  async loadAllPairs(): Promise<MentoringPairFull[]> {
    const { data, error } = await this.sb
      .from('mentoring_pairs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MentoringService.loadAllPairs]', error);
      return MOCK_PAIRS;
    }
    if (!data || data.length === 0) return MOCK_PAIRS;

    return this._enrichPairs(data);
  }

  // Enrich raw pairs with employee names, positions, and session stats
  private async _enrichPairs(pairs: any[]): Promise<MentoringPairFull[]> {
    if (pairs.length === 0) return [];

    const mentorIds = [...new Set(pairs.map(p => p.mentor_id))];
    const menteeIds = [...new Set(pairs.map(p => p.mentee_id))];
    const allIds    = [...new Set([...mentorIds, ...menteeIds])];

    const [empRes, sessRes] = await Promise.all([
      this.sb.from('v_employees').select('id, full_name, position').in('id', allIds),
      this.sb.from('mentoring_sessions').select('pair_id, duration_minutes, status')
        .in('pair_id', pairs.map(p => p.id)),
    ]);

    const empMap  = new Map((empRes.data ?? []).map(e => [e.id, e]));

    // Group sessions by pair
    const sessionsByPair = new Map<string, any[]>();
    for (const s of (sessRes.data ?? [])) {
      if (!sessionsByPair.has(s.pair_id)) sessionsByPair.set(s.pair_id, []);
      sessionsByPair.get(s.pair_id)!.push(s);
    }

    return pairs.map(p => {
      const sessions = sessionsByPair.get(p.id) ?? [];
      const confirmedMins = sessions
        .filter((s: any) => s.status === 'confirmed' || s.status === 'auto_confirmed')
        .reduce((sum: number, s: any) => sum + (s.duration_minutes ?? 0), 0);
      const mentor = empMap.get(p.mentor_id);
      const mentee = empMap.get(p.mentee_id);

      return {
        ...p,
        mentor_name:     mentor?.full_name  ?? p.mentor_id,
        mentor_position: mentor?.position   ?? '',
        mentee_name:     mentee?.full_name  ?? p.mentee_id,
        mentee_position: mentee?.position   ?? '',
        confirmed_hours: Math.round(confirmedMins / 60 * 10) / 10,
        sessions_count:  sessions.length,
      } as MentoringPairFull;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load sessions for a pair
  // ─────────────────────────────────────────────────────────────────────────────
  async loadSessions(pairId: string): Promise<MentoringSessionFull[]> {
    // Return mock sessions for demo pairs
    if (MOCK_SESSIONS[pairId]) return MOCK_SESSIONS[pairId];

    const { data, error } = await this.sb
      .from('mentoring_sessions')
      .select('*')
      .eq('pair_id', pairId)
      .order('session_date', { ascending: false });

    if (error) {
      console.error('[MentoringService.loadSessions]', error);
      return [];
    }
    return (data ?? []) as MentoringSessionFull[];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load mentee's skills from latest active assessment cycle
  // ─────────────────────────────────────────────────────────────────────────────
  async loadMenteeSkills(menteeId: string): Promise<SkillScore[]> {
    // Get latest active cycle
    const { data: cycleData, error: cycleErr } = await this.sb
      .from('assessment_cycles')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleErr || !cycleData) {
      console.error('[MentoringService.loadMenteeSkills] No active cycle:', cycleErr);
      return [];
    }

    // Get scores for this mentee in this cycle
    const { data: scores, error: scoresErr } = await this.sb
      .from('assessment_scores')
      .select('criterion_id, score')
      .eq('employee_id', menteeId)
      .eq('cycle_id', cycleData.id);

    if (scoresErr || !scores || scores.length === 0) {
      console.error('[MentoringService.loadMenteeSkills] No scores:', scoresErr);
      return [];
    }

    const criterionIds = scores.map(s => s.criterion_id);

    // Get criteria info
    const { data: criteria, error: critErr } = await this.sb
      .from('assessment_criteria')
      .select('id, key, label, assessment_type')
      .in('id', criterionIds)
      .eq('is_active', true);

    if (critErr || !criteria) {
      console.error('[MentoringService.loadMenteeSkills] No criteria:', critErr);
      return [];
    }

    const criteriaMap = new Map(criteria.map(c => [c.id, c]));

    return scores.map(s => {
      const crit = criteriaMap.get(s.criterion_id);
      const isKpi = crit?.assessment_type?.toLowerCase().includes('kpi') || false;
      const max_score = isKpi ? 100 : 5;
      return {
        criterion_id:    s.criterion_id,
        key:             crit?.key           ?? s.criterion_id,
        label:           crit?.label         ?? s.criterion_id,
        score:           s.score             ?? 0,
        max_score,
        assessment_type: crit?.assessment_type ?? 'kpi',
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Suggest mentors — find employees with >= 15% gap in selected skills
  // ─────────────────────────────────────────────────────────────────────────────
  async suggestMentors(
    menteeId: string,
    selectedSkillKeys: string[],
    allScores: SkillScore[],
  ): Promise<MentorSuggestion[]> {
    if (selectedSkillKeys.length === 0) return [];

    // Map mentee scores by key
    const menteeScoreMap = new Map(allScores.map(s => [s.key, s]));
    const selectedCriteria = allScores.filter(s => selectedSkillKeys.includes(s.key));
    if (selectedCriteria.length === 0) return [];

    const criterionIds = selectedCriteria.map(s => s.criterion_id);

    // Get latest active cycle
    const { data: cycleData } = await this.sb
      .from('assessment_cycles')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cycleData) return [];

    // Get scores for ALL employees in selected criteria (except mentee)
    const { data: allEmpScores, error } = await this.sb
      .from('assessment_scores')
      .select('employee_id, criterion_id, score')
      .eq('cycle_id', cycleData.id)
      .in('criterion_id', criterionIds)
      .neq('employee_id', menteeId);

    if (error || !allEmpScores) {
      console.error('[MentoringService.suggestMentors]', error);
      return [];
    }

    // Get active pairs to check capacity (mentor max 1 active mentee)
    const { data: activePairs } = await this.sb
      .from('mentoring_pairs')
      .select('mentor_id')
      .in('status', ['active', 'pending_mentor', 'pending_lm', 'pending_hr']);

    const activeMentorCount = new Map<string, number>();
    for (const p of (activePairs ?? [])) {
      activeMentorCount.set(p.mentor_id, (activeMentorCount.get(p.mentor_id) ?? 0) + 1);
    }

    // Group scores by employee
    const empScoreMap = new Map<string, Map<string, number>>();
    for (const s of allEmpScores) {
      if (!empScoreMap.has(s.employee_id)) empScoreMap.set(s.employee_id, new Map());
      empScoreMap.get(s.employee_id)!.set(s.criterion_id, s.score);
    }

    // Get employee info
    const empIds = [...empScoreMap.keys()];
    if (empIds.length === 0) return [];

    const { data: employees } = await this.sb
      .from('v_employees')
      .select('id, full_name, position, department_name')
      .in('id', empIds);

    const empInfoMap = new Map((employees ?? []).map(e => [e.id, e]));
    const criteriaById = new Map(selectedCriteria.map(s => [s.criterion_id, s]));

    const suggestions: MentorSuggestion[] = [];

    for (const [empId, empCriteriaScores] of empScoreMap.entries()) {
      const skillScores: MentorSuggestion['skill_scores'] = [];
      let allQualified = true;

      for (const crit of selectedCriteria) {
        const mentorScore = empCriteriaScores.get(crit.criterion_id) ?? 0;
        const menteeScore = menteeScoreMap.get(crit.key)?.score ?? 0;
        const gap_pct = (mentorScore - menteeScore) / crit.max_score;

        if (gap_pct < 0.15) {
          allQualified = false;
          break;
        }
        skillScores.push({
          key:           crit.key,
          label:         crit.label,
          mentor_score:  mentorScore,
          mentee_score:  menteeScore,
          gap_pct:       Math.round(gap_pct * 100),
        });
      }

      if (!allQualified || skillScores.length < selectedCriteria.length) continue;

      const avg_gap_pct = Math.round(skillScores.reduce((s, x) => s + x.gap_pct, 0) / skillScores.length);
      const active_mentee_count = activeMentorCount.get(empId) ?? 0;

      // Capacity: max 1 active mentee
      if (active_mentee_count >= 1) continue;

      const emp = empInfoMap.get(empId);

      suggestions.push({
        employee_id:        empId,
        full_name:          emp?.full_name      ?? empId,
        position:           emp?.position       ?? '',
        department:         emp?.department_name ?? '',
        avg_gap_pct,
        skill_scores:       skillScores,
        active_mentee_count,
      });
    }

    // Sort by average gap descending
    suggestions.sort((a, b) => b.avg_gap_pct - a.avg_gap_pct);
    return suggestions;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Create a mentoring pair
  // ─────────────────────────────────────────────────────────────────────────────
  async createPair(payload: {
    mentor_id: string;
    mentee_id: string;
    skills: string[];
    skill_labels: string[];
    initiated_by: 'mentee' | 'lm' | 'hr';
    initiator_id: string;
    duration_months: number;
    monthly_hours: number;
    goals: string;
    justification: string;
  }): Promise<{ data: any; error: any }> {
    // Determine initial status based on who initiates
    let status: string;
    if (payload.initiated_by === 'mentee') {
      status = 'pending_mentor';
    } else if (payload.initiated_by === 'lm') {
      status = 'pending_mentor';
    } else {
      // hr/admin: skip to pending_lm
      status = 'pending_lm';
    }

    const { data, error } = await this.sb
      .from('mentoring_pairs')
      .insert({ ...payload, status })
      .select()
      .maybeSingle();

    if (error) console.error('[MentoringService.createPair]', error);
    return { data, error };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mentor responds (accept → advance status, decline → reject)
  // ─────────────────────────────────────────────────────────────────────────────
  async respondAsMentor(pairId: string, accept: boolean, reason?: string): Promise<void> {
    if (!accept) {
      const { error } = await this.sb
        .from('mentoring_pairs')
        .update({ status: 'rejected', reject_reason: reason ?? 'Mentor từ chối', updated_at: new Date().toISOString() })
        .eq('id', pairId);
      if (error) console.error('[MentoringService.respondAsMentor] reject:', error);
      return;
    }

    // Accept: get current state to determine next step
    const { data: pair } = await this.sb
      .from('mentoring_pairs')
      .select('initiated_by, status')
      .eq('id', pairId)
      .maybeSingle();

    let nextStatus: string;
    if (pair?.initiated_by === 'mentee') {
      // bottom-up: pending_mentor → pending_lm
      nextStatus = 'pending_lm';
    } else if (pair?.initiated_by === 'lm') {
      // top-down: pending_mentor → pending_hr
      nextStatus = 'pending_hr';
    } else {
      // hr: pending_lm → pending_mentor → active (mentor is last step)
      nextStatus = 'active';
    }

    const { error } = await this.sb
      .from('mentoring_pairs')
      .update({
        status:     nextStatus,
        start_date: nextStatus === 'active' ? new Date().toISOString().split('T')[0] : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pairId);
    if (error) console.error('[MentoringService.respondAsMentor] accept:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Approver (LM or HR) responds
  // ─────────────────────────────────────────────────────────────────────────────
  async respondAsApprover(pairId: string, accept: boolean, role: 'lm' | 'hr'): Promise<void> {
    if (!accept) {
      const { error } = await this.sb
        .from('mentoring_pairs')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', pairId);
      if (error) console.error('[MentoringService.respondAsApprover] reject:', error);
      return;
    }

    const { data: pair } = await this.sb
      .from('mentoring_pairs')
      .select('initiated_by, status')
      .eq('id', pairId)
      .maybeSingle();

    let nextStatus: string;
    if (role === 'lm') {
      // After LM approves: pending_lm → pending_hr (always)
      nextStatus = 'pending_hr';
    } else {
      // After HR approves: → active (with start date)
      nextStatus = 'active';
    }

    const { error } = await this.sb
      .from('mentoring_pairs')
      .update({
        status:     nextStatus,
        start_date: nextStatus === 'active' ? new Date().toISOString().split('T')[0] : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pairId);
    if (error) console.error('[MentoringService.respondAsApprover] accept:', error);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Log a new session
  // ─────────────────────────────────────────────────────────────────────────────
  async logSession(payload: {
    pair_id: string;
    session_date: string;
    duration_minutes: number;
    title: string;
    mentee_notes: string;
    logged_by: string;
  }): Promise<void> {
    const { error } = await this.sb
      .from('mentoring_sessions')
      .insert({ ...payload, status: 'pending_confirm' });
    if (error) console.error('[MentoringService.logSession]', error);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Confirm a session (mentor)
  // ─────────────────────────────────────────────────────────────────────────────
  async confirmSession(sessionId: string, feedback?: string): Promise<void> {
    const { error } = await this.sb
      .from('mentoring_sessions')
      .update({
        status:          'confirmed',
        mentor_feedback: feedback ?? null,
        confirmed_at:    new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (error) console.error('[MentoringService.confirmSession]', error);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load pairs pending my action (used in pending tab)
  // ─────────────────────────────────────────────────────────────────────────────
  async loadPendingForMe(currentEmployeeId: string, userRole: string): Promise<MentoringPairFull[]> {
    const filters: string[] = [];

    if (userRole === 'Admin' || userRole === 'HR Manager') {
      // HR/Admin see all pending_hr
      filters.push('status.eq.pending_hr');
    }
    if (userRole === 'Admin' || userRole === 'Line Manager') {
      // LM sees pending_lm
      filters.push('status.eq.pending_lm');
    }

    // Mentor pending: pairs where I am the mentor
    const orFilter = filters.length > 0 ? filters.join(',') : 'status.eq.pending_mentor';

    const { data, error } = await this.sb
      .from('mentoring_pairs')
      .select('*')
      .or(orFilter);

    if (error) {
      console.error('[MentoringService.loadPendingForMe]', error);
      return MOCK_PAIRS.filter(p => p.status.startsWith('pending'));
    }

    // Also get pairs where I am the mentor and status = pending_mentor
    const { data: mentorPending } = await this.sb
      .from('mentoring_pairs')
      .select('*')
      .eq('mentor_id', currentEmployeeId)
      .eq('status', 'pending_mentor');

    const combined = [...(data ?? []), ...(mentorPending ?? [])];
    // Deduplicate
    const seen = new Set<string>();
    const deduped = combined.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (deduped.length === 0) return MOCK_PAIRS.filter(p => p.status.startsWith('pending'));
    return this._enrichPairs(deduped);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load all employees (for mentee / mentor selection)
  // ─────────────────────────────────────────────────────────────────────────────
  async loadEmployees(): Promise<{ id: string; full_name: string; position: string; department_name: string }[]> {
    const { data, error } = await this.sb
      .from('v_employees')
      .select('id, full_name, position, department_name')
      .order('full_name');
    if (error) { console.error('[MentoringService.loadEmployees]', error); return []; }
    return (data ?? []) as { id: string; full_name: string; position: string; department_name: string }[];
  }
}
