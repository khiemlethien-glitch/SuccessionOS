// @ts-nocheck — migration: PostgREST returns untyped rows, schema codegen pending
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

// ── No mock data — uses real Supabase tables ───────────────────────────────────


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
      .in('status', ['Active', 'PendingMentor', 'PendingLM', 'PendingHR', 'Completed'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MentoringService.loadMyPairs]', error);
      return [];
    }
    if (!data || data.length === 0) return [];

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
      return [];
    }
    if (!data || data.length === 0) return [];

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

      // Gracefully handle old DB schema (focus_area) vs new schema (skill_labels[])
      const skillLabels: string[] = p.skill_labels?.length
        ? p.skill_labels
        : (p.focus_area ? [p.focus_area] : []);
      const skills: string[] = p.skills?.length
        ? p.skills
        : (p.focus_area ? [p.focus_area.toLowerCase().replace(/ /g, '_')] : []);

      // duration_months: prefer new column, fall back to computing from start/end dates
      let durationMonths: number = p.duration_months ?? 0;
      if (!durationMonths && p.start_date && p.end_date) {
        const ms = new Date(p.end_date).getTime() - new Date(p.start_date).getTime();
        durationMonths = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30)));
      }
      if (!durationMonths) durationMonths = 6; // sensible default

      return {
        ...p,
        mentor_name:     mentor?.full_name  ?? p.mentor_id,
        mentor_position: mentor?.position   ?? '',
        mentee_name:     mentee?.full_name  ?? p.mentee_id,
        mentee_position: mentee?.position   ?? '',
        confirmed_hours: Math.round(confirmedMins / 60 * 10) / 10,
        sessions_count:  sessions.length,
        skill_labels:    skillLabels,
        skills:          skills,
        goals:           p.goals ?? p.focus_area ?? null,
        duration_months: durationMonths,
        monthly_hours:   p.monthly_hours ?? 8,
      } as MentoringPairFull;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load sessions for a pair
  // ─────────────────────────────────────────────────────────────────────────────
  async loadSessions(pairId: string): Promise<MentoringSessionFull[]> {
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
      .in('status', ['Active', 'PendingMentor', 'PendingLM', 'PendingHR']);

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
      status = 'PendingMentor';
    } else if (payload.initiated_by === 'lm') {
      status = 'PendingMentor';
    } else {
      // hr/admin: skip to pending_lm
      status = 'PendingLM';
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
        .update({ status: 'Rejected', reject_reason: reason ?? 'Mentor từ chối', updated_at: new Date().toISOString() })
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
      // bottom-up: PendingMentor → PendingLM
      nextStatus = 'PendingLM';
    } else if (pair?.initiated_by === 'lm') {
      // top-down: PendingMentor → PendingHR
      nextStatus = 'PendingHR';
    } else {
      // hr: PendingLM → PendingMentor → Active (mentor is last step)
      nextStatus = 'Active';
    }

    const { error } = await this.sb
      .from('mentoring_pairs')
      .update({
        status:     nextStatus,
        start_date: nextStatus === 'Active' ? new Date().toISOString().split('T')[0] : null,
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
        .update({ status: 'Rejected', updated_at: new Date().toISOString() })
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
      // After LM approves: PendingLM → PendingHR (always)
      nextStatus = 'PendingHR';
    } else {
      // After HR approves: → Active (with start date)
      nextStatus = 'Active';
    }

    const { error } = await this.sb
      .from('mentoring_pairs')
      .update({
        status:     nextStatus,
        start_date: nextStatus === 'Active' ? new Date().toISOString().split('T')[0] : null,
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
  // Load pairs for the "Chờ duyệt" tab:
  //   - Mentee view  : ALL my own pending requests (any step), so I can track progress
  //   - Mentor view  : pairs where I was chosen as mentor & must accept
  //   - LM / Admin   : all PendingLM pairs needing approval
  //   - HR / Admin   : all PendingHR pairs needing approval
  // ─────────────────────────────────────────────────────────────────────────────
  async loadPendingForMe(empId: string, userRole: string): Promise<MentoringPairFull[]> {
    const all: any[] = [];

    // 1. My own requests as mentee — show at every step so I can track progress
    if (empId) {
      const { data } = await this.sb
        .from('mentoring_pairs')
        .select('*')
        .eq('mentee_id', empId)
        .or('status.eq.PendingMentor,status.eq.PendingLM,status.eq.PendingHR');
      all.push(...(data ?? []));
    }

    // 2. Pairs where I was chosen as mentor and must accept/decline
    if (empId) {
      const { data } = await this.sb
        .from('mentoring_pairs')
        .select('*')
        .eq('mentor_id', empId)
        .eq('status', 'PendingMentor');
      all.push(...(data ?? []));
    }

    // 3. All PendingLM pairs — LM and Admin need to act
    if (userRole === 'Line Manager' || userRole === 'Admin') {
      const { data } = await this.sb
        .from('mentoring_pairs')
        .select('*')
        .eq('status', 'PendingLM');
      all.push(...(data ?? []));
    }

    // 4. All PendingHR pairs — HR Manager and Admin need to act
    if (userRole === 'HR Manager' || userRole === 'Admin') {
      const { data } = await this.sb
        .from('mentoring_pairs')
        .select('*')
        .eq('status', 'PendingHR');
      all.push(...(data ?? []));
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = all.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (deduped.length === 0) return [];
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
