import type { FamilyEvent, FamilyTask, Person, Project } from './types';

export type ApiContext = { accessToken: string };

async function request<T>(path: string, ctx: ApiContext, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.accessToken}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Não foi possível concluir esta ação.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  projects: (ctx: ApiContext) => request<Project[]>('/projects', ctx),
  saveProject: (ctx: ApiContext, body: Partial<Project>) => request<Project>('/projects', ctx, { method: 'POST', body: JSON.stringify(body) }),
  deleteProject: (ctx: ApiContext, id: string) => request<void>(`/projects/${id}`, ctx, { method: 'DELETE' }),
  people: (ctx: ApiContext) => request<Person[]>('/people', ctx),
  savePerson: (ctx: ApiContext, body: Partial<Person>) => request<Person>('/people', ctx, { method: 'POST', body: JSON.stringify(body) }),
  deletePerson: (ctx: ApiContext, id: string) => request<void>(`/people/${id}`, ctx, { method: 'DELETE' }),
  tasks: (ctx: ApiContext) => request<FamilyTask[]>('/tasks', ctx),
  saveTask: (ctx: ApiContext, body: Partial<FamilyTask>) => request<FamilyTask>('/tasks', ctx, { method: 'POST', body: JSON.stringify(body) }),
  completeTask: (ctx: ApiContext, id: string, completed: boolean) => request<FamilyTask>(`/tasks/${id}`, ctx, { method: 'PATCH', body: JSON.stringify({ completed }) }),
  deleteTask: (ctx: ApiContext, id: string) => request<void>(`/tasks/${id}`, ctx, { method: 'DELETE' }),
  events: (ctx: ApiContext, from: string, to: string) => request<FamilyEvent[]>(`/events?from=${from}&to=${to}`, ctx),
  saveEvent: (ctx: ApiContext, body: Partial<FamilyEvent>) => request<FamilyEvent>('/events', ctx, { method: 'POST', body: JSON.stringify(body) }),
  deleteEvent: (ctx: ApiContext, id: string) => request<void>(`/events/${id}`, ctx, { method: 'DELETE' }),
};
