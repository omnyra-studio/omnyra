import { supabaseAdmin } from "@/lib/supabase/admin";

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobType   = 'cinematic' | 'avatar' | 'quick' | 'continuation';
export type JobPriority = 'normal' | 'high';

export interface ScheduledJob {
  id:          string;
  userId:      string;
  projectId?:  string;
  type:        JobType;
  priority:    JobPriority;
  status:      JobStatus;
  payload:     Record<string, unknown>;
  resultUrl?:  string;
  errorMsg?:   string;
  attempts:    number;
  createdAt:   string;
  startedAt?:  string;
  completedAt?: string;
}

export class JobScheduler {
  async enqueue(params: {
    userId:     string;
    projectId?: string;
    type:       JobType;
    priority?:  JobPriority;
    payload:    Record<string, unknown>;
  }): Promise<ScheduledJob> {
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .insert({
        user_id:    params.userId,
        project_id: params.projectId ?? null,
        type:       params.type,
        priority:   params.priority ?? 'normal',
        status:     'queued',
        payload:    params.payload,
        attempts:   0,
      })
      .select()
      .single();

    if (error) throw new Error(`[JobScheduler] enqueue failed: ${error.message}`);
    return this.#toModel(data);
  }

  async claim(type: JobType, priority: JobPriority = 'normal'): Promise<ScheduledJob | null> {
    const { data } = await supabaseAdmin
      .from('jobs')
      .select()
      .eq('type', type)
      .eq('priority', priority)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!data) return null;

    await supabaseAdmin
      .from('jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: data.attempts + 1 })
      .eq('id', data.id);

    return this.#toModel({ ...data, status: 'running' });
  }

  async complete(jobId: string, resultUrl: string): Promise<void> {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'completed', result_url: resultUrl, completed_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  async fail(jobId: string, errorMsg: string): Promise<void> {
    await supabaseAdmin
      .from('jobs')
      .update({ status: 'failed', error_msg: errorMsg, completed_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  async getStatus(jobId: string): Promise<ScheduledJob | null> {
    const { data } = await supabaseAdmin.from('jobs').select().eq('id', jobId).single();
    return data ? this.#toModel(data) : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #toModel(row: any): ScheduledJob {
    return {
      id:           row.id,
      userId:       row.user_id,
      projectId:    row.project_id ?? undefined,
      type:         row.type,
      priority:     row.priority,
      status:       row.status,
      payload:      row.payload ?? {},
      resultUrl:    row.result_url ?? undefined,
      errorMsg:     row.error_msg ?? undefined,
      attempts:     row.attempts,
      createdAt:    row.created_at,
      startedAt:    row.started_at ?? undefined,
      completedAt:  row.completed_at ?? undefined,
    };
  }
}
