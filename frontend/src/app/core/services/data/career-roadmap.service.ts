import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { environment } from '../../../../environments/environment';
import { Talent } from '../../models/models';

// ─── Data models ──────────────────────────────────────────────────────────────

export interface CourseItem {
  id: string;
  name: string;
  provider: string;
  duration: string;
  price: string;
  language: string;
  icon_type: string;   // 'monitor' | 'certificate' | 'book' | 'video'
  features: string[];
}

export interface SkillGap {
  id: string;
  skill_name: string;
  category: string;    // 'Technical' | 'Leadership' | 'Communication' | 'Strategic'
  current_level: number;   // 1-5
  required_level: number;  // 1-5
  priority: 'core' | 'important' | 'nice-to-have';
  rationale: string;
  courses: CourseItem[];
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  months: string;   // "0-6 tháng"
  theme: string;
  color: 'blue' | 'green' | 'yellow';
  tasks: string[];
}

export interface CareerRoadmap {
  id?: string;
  employee_id: string;
  track: 'expert' | 'manager';
  status: 'confirmed';
  ai_summary: string;
  confidence_score: number;
  estimated_timeline: string;
  target_position: string;
  strengths: string[];
  challenges: string[];
  alternative_path: string;
  skill_gaps: SkillGap[];
  phases: RoadmapPhase[];
  generated_at?: string;
  confirmed_at?: string;
  confirmed_by?: string;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert HR talent development advisor at PTSC (Petroleum Technical Services Corporation), a major Vietnamese oil & gas engineering company.

Generate a personalized, specific career development roadmap in Vietnamese based on employee data.
- Write ALL text in Vietnamese (course names can be in English if internationally known)
- Recommend real courses from real providers (Coursera, LinkedIn Learning, PMI, Udemy, etc.) with realistic pricing
- Be specific to the Vietnamese oil & gas / engineering industry
- Return ONLY valid JSON, no markdown, no code blocks`;

function buildUserPrompt(talent: Talent, track: 'expert' | 'manager'): string {
  const trackLabel = track === 'expert' ? 'Chuyên gia Kỹ thuật' : 'Nhà Quản Lý';
  const trackGuide = track === 'expert'
    ? 'Focus: deep technical mastery, certifications, becoming the go-to Subject Matter Expert and technical authority. Target senior specialist / principal engineer / technical director.'
    : 'Focus: people management, leadership, stakeholder communication, strategic thinking, transitioning from individual contributor to manager. Target team lead / manager / department head.';

  const comp = talent.competencies;

  return `Generate a "${trackLabel}" career roadmap for this employee:

Name: ${talent.full_name}
Current Position: ${talent.position}
Department: ${talent.department}
Experience: ${talent.tenure_years ?? talent.years_of_experience ?? 'N/A'} years
Performance Score: ${talent.performance_score}/100
Potential Score: ${talent.potential_score}/100
Talent Tier: ${talent.talent_tier ?? 'N/A'}
Readiness Level: ${talent.readiness_level ?? 'N/A'}
Risk Score: ${talent.risk_score ?? 'N/A'}/100

Competency Scores (0–100):
  Technical: ${comp?.technical ?? 'N/A'}
  Leadership: ${comp?.leadership ?? 'N/A'}
  Communication: ${comp?.communication ?? 'N/A'}
  Problem Solving: ${comp?.problem_solving ?? 'N/A'}
  Adaptability: ${comp?.adaptability ?? 'N/A'}

Track: ${trackGuide}

Return ONLY this JSON (no markdown, no extra keys):
{
  "ai_summary": "2-3 sentence Vietnamese summary of readiness and development needs",
  "confidence_score": <integer 60-95>,
  "estimated_timeline": "X-Y tháng",
  "target_position": "Vietnamese job title",
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2", "Điểm mạnh 3"],
  "challenges": ["Thách thức 1", "Thách thức 2", "Thách thức 3"],
  "alternative_path": "Alternative Vietnamese job title",
  "skill_gaps": [
    {
      "id": "sg1",
      "skill_name": "Tên kỹ năng",
      "category": "Technical",
      "current_level": 3,
      "required_level": 5,
      "priority": "core",
      "rationale": "Lý do cần kỹ năng này",
      "courses": [
        {
          "id": "c1",
          "name": "Course Name",
          "provider": "Provider",
          "duration": "6 tuần",
          "price": "$299",
          "language": "English",
          "icon_type": "monitor",
          "features": ["Tính năng 1", "Tính năng 2"]
        }
      ]
    }
  ],
  "phases": [
    { "phase": 1, "title": "Tên giai đoạn", "months": "0-6 tháng", "theme": "Chủ đề", "color": "blue",
      "tasks": ["Nhiệm vụ 1", "Nhiệm vụ 2", "Nhiệm vụ 3"] },
    { "phase": 2, "title": "Tên giai đoạn", "months": "6-12 tháng", "theme": "Chủ đề", "color": "green",
      "tasks": ["Nhiệm vụ 1", "Nhiệm vụ 2", "Nhiệm vụ 3"] },
    { "phase": 3, "title": "Tên giai đoạn", "months": "12-18 tháng", "theme": "Chủ đề", "color": "yellow",
      "tasks": ["Nhiệm vụ 1", "Nhiệm vụ 2", "Nhiệm vụ 3"] }
  ]
}`;
}

// ─── Data normalizer (handles both AI-generated & seeded simplified format) ───

function normalizeRoadmap(raw: any): CareerRoadmap {
  const PHASE_COLORS: ('blue' | 'green' | 'yellow')[] = ['blue', 'green', 'yellow'];

  const skill_gaps: SkillGap[] = Array.isArray(raw.skill_gaps)
    ? raw.skill_gaps.map((g: any, i: number) => ({
        id:            g.id ?? `sg${i}`,
        skill_name:    g.skill_name ?? g.skill ?? '',
        category:      g.category ?? 'Technical',
        current_level: g.current_level ?? 2,
        required_level:g.required_level ?? 4,
        priority:      (g.priority === 'High' ? 'core'
                      : g.priority === 'Medium' ? 'important'
                      : g.priority ?? 'nice-to-have') as SkillGap['priority'],
        rationale:     g.rationale ?? '',
        courses:       Array.isArray(g.courses) ? g.courses.map((c: any, ci: number) => ({
          id:        c.id ?? `c${ci}`,
          name:      c.name ?? '',
          provider:  c.provider ?? '',
          duration:  c.duration ?? '',
          price:     c.price ?? '',
          language:  c.language ?? 'Vietnamese',
          icon_type: c.icon_type ?? 'book',
          features:  Array.isArray(c.features) ? c.features : [],
        } as CourseItem)) : [],
      }))
    : [];

  const phases = Array.isArray(raw.phases)
    ? raw.phases.map((p: any) => ({
        phase:  p.phase ?? 1,
        title:  p.title ?? '',
        months: p.months ?? p.duration ?? '',
        theme:  p.theme ?? p.title ?? '',
        color:  (['blue','green','yellow'].includes(p.color) ? p.color : PHASE_COLORS[(p.phase ?? 1) - 1] ?? 'blue') as 'blue'|'green'|'yellow',
        tasks:  Array.isArray(p.tasks)
                  ? p.tasks
                  : [
                      ...(Array.isArray(p.activities)  ? p.activities  : []),
                      ...(Array.isArray(p.milestones)   ? p.milestones  : []),
                    ],
      }))
    : [];

  return {
    ...raw,
    strengths:  Array.isArray(raw.strengths)  ? raw.strengths.map((s: any)  => typeof s === 'string' ? s : (s.area ?? s.note ?? JSON.stringify(s))) : [],
    challenges: Array.isArray(raw.challenges) ? raw.challenges.map((c: any) => typeof c === 'string' ? c : (c.area ?? c.note ?? JSON.stringify(c))) : [],
    skill_gaps,
    phases,
  } as CareerRoadmap;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CareerRoadmapService {
  private sb = inject(SupabaseService);

  /** Fetch confirmed roadmaps for an employee from Supabase */
  async fetchConfirmed(employeeId: string): Promise<{ expert: CareerRoadmap | null; manager: CareerRoadmap | null }> {
    try {
      const { data } = await this.sb.client
        .from('career_roadmaps')
        .select('*')
        .eq('employee_id', employeeId);

      if (!data) return { expert: null, manager: null };
      return {
        expert:  data.find((r: any) => r.track === 'expert')  ? normalizeRoadmap(data.find((r: any) => r.track === 'expert'))  : null,
        manager: data.find((r: any) => r.track === 'manager') ? normalizeRoadmap(data.find((r: any) => r.track === 'manager')) : null,
      };
    } catch {
      return { expert: null, manager: null };
    }
  }

  /**
   * Call OpenAI GPT-4o via Supabase Edge Function.
   * The OpenAI API key lives server-side as an Edge Function secret —
   * it is never included in the browser bundle or visible in DevTools.
   */
  async callOpenAI(talent: Talent, track: 'expert' | 'manager'): Promise<CareerRoadmap> {
    const apiKey = environment.openaiKey;
    if (!apiKey) throw new Error('OpenAI key chưa được cấu hình');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserPrompt(talent, track) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens:  4000,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${body}`);
    }

    const json = await resp.json();
    const parsed: Omit<CareerRoadmap, 'employee_id' | 'track' | 'status'> =
      JSON.parse(json.choices[0].message.content);

    return {
      employee_id:  talent.id,
      track,
      status:       'confirmed',
      generated_at: new Date().toISOString(),
      ...parsed,
    };
  }

  /** Upsert a confirmed roadmap to Supabase */
  async save(roadmap: CareerRoadmap): Promise<CareerRoadmap> {
    const payload = {
      employee_id:       roadmap.employee_id,
      track:             roadmap.track,
      status:            'confirmed',
      ai_summary:        roadmap.ai_summary,
      confidence_score:  roadmap.confidence_score,
      estimated_timeline: roadmap.estimated_timeline,
      target_position:   roadmap.target_position,
      strengths:         roadmap.strengths,
      challenges:        roadmap.challenges,
      alternative_path:  roadmap.alternative_path,
      skill_gaps:        roadmap.skill_gaps,
      phases:            roadmap.phases,
      generated_at:      roadmap.generated_at,
      confirmed_at:      new Date().toISOString(),
    };

    const { data, error } = await this.sb.client
      .from('career_roadmaps')
      .upsert(payload, { onConflict: 'employee_id,track' })
      .select()
      .single();

    if (error) throw error;
    return data as CareerRoadmap;
  }

  /** Bulk generate for all employees — returns count processed */
  async bulkGenerate(
    talents: Talent[],
    onProgress: (done: number, total: number) => void
  ): Promise<number> {
    let done = 0;
    for (const talent of talents) {
      try {
        for (const track of ['expert', 'manager'] as const) {
          const roadmap = await this.callOpenAI(talent, track);
          await this.save(roadmap);
        }
        done++;
        onProgress(done, talents.length);
      } catch {
        // Continue with next employee on error
      }
      // Brief pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
    return done;
  }
}
