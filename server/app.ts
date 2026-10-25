import express, { type NextFunction, type Request, type Response } from 'express';
import { google } from 'googleapis';
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { family } from './firebaseAdmin.js';
import type { FamilyEvent, FamilyTask, Person, Project } from '../src/types.js';

const app = express();
const allowedEmails = ['daphneklann@gmail.com', 'vnsnet@gmail.com'];
const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
const taskCollection = family.collection('tasks');
const projectCollection = family.collection('projects');
const peopleCollection = family.collection('people');
const taskListCollection = family.collection('googleTaskLists');
const categories = new Set(['Pessoal', 'O Pudim Perfeito', 'OPP Santa Felicidade', 'Eventos', 'Fora da Caixa', 'Campina', 'Maria Antônia', 'Médicos', 'Planos']);

app.use(express.json({ limit: '1mb' }));

type AuthenticatedRequest = Request & { accessToken: string; familyEmail: string; googleClient: InstanceType<typeof google.auth.OAuth2> };
const authReq = (req: Request) => req as unknown as AuthenticatedRequest;

async function requireAllowedGoogleUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Faça login com sua conta Google para continuar.' });
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) return res.status(401).json({ error: 'Sessão Google expirada. Entre novamente.' });
    const profile = await profileRes.json() as { email?: string; email_verified?: boolean };
    const email = profile.email?.toLowerCase();
    if (!email || !profile.email_verified || !allowedEmails.includes(email)) {
      return res.status(403).json({ error: 'Esta agenda é restrita às contas autorizadas.' });
    }
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const authed = authReq(req);
    authed.accessToken = token;
    authed.familyEmail = email;
    authed.googleClient = auth;
    return next();
  } catch {
    return res.status(401).json({ error: 'Não foi possível validar a sessão Google.' });
  }
}

app.use('/api', requireAllowedGoogleUser);

function toRecord<T>(doc: QueryDocumentSnapshot | DocumentSnapshot): T {
  return { id: doc.id, ...(doc.data() ?? {}) } as T;
}

async function getOrCreateTaskList(auth: InstanceType<typeof google.auth.OAuth2>, email: string, project: Project) {
  const ref = taskListCollection.doc(project.id);
  const snap = await ref.get();
  const mapping = (snap.data()?.byEmail ?? {}) as Record<string, string>;
  if (mapping[email]) return mapping[email];

  const tasksApi = google.tasks({ version: 'v1', auth });
  const title = `Agenda da Família · ${project.name}`;
  const existing = await tasksApi.tasklists.list({ maxResults: 100 });
  const found = existing.data.items?.find(item => item.title === title);
  const taskListId = found?.id ?? (await tasksApi.tasklists.insert({ requestBody: { title } })).data.id;
  if (!taskListId) throw new Error('Não foi possível criar a lista no Google Tasks.');
  await ref.set({ byEmail: { ...mapping, [email]: taskListId }, title }, { merge: true });
  return taskListId;
}

async function ensureTaskMirror(auth: InstanceType<typeof google.auth.OAuth2>, email: string, task: FamilyTask) {
  const projectSnap = await projectCollection.doc(task.projectId).get();
  if (!projectSnap.exists) throw new Error('O projeto relacionado não foi encontrado.');
  const project = toRecord<Project>(projectSnap);
  const taskListId = await getOrCreateTaskList(auth, email, project);
  const ref = taskCollection.doc(task.id);
  const refs = task.googleTaskRefs ?? {};
  if (refs[email]) return { ...task, googleTaskRefs: refs };
  const tasksApi = google.tasks({ version: 'v1', auth });
  const notes = JSON.stringify({
    agendaFamilia: true, category: task.category, projectId: task.projectId,
    personId: task.personId ?? null, priority: task.priority, complex: task.complex, time: task.time || null,
  });
  const created = await tasksApi.tasks.insert({
    tasklist: taskListId,
    requestBody: { title: task.title, due: `${task.date}T00:00:00.000Z`, notes: `Agenda da Família ${notes}` },
  });
  const nextRefs = { ...refs, [email]: { tasklistId: taskListId, taskId: created.data.id! } };
  await ref.set({ googleTaskRefs: nextRefs }, { merge: true });
  return { ...task, googleTaskRefs: nextRefs };
}

async function syncTaskFromGoogle(auth: InstanceType<typeof google.auth.OAuth2>, email: string, task: FamilyTask) {
  const mirror = task.googleTaskRefs?.[email];
  if (!mirror) return task;
  const tasksApi = google.tasks({ version: 'v1', auth });
  try {
    const result = await tasksApi.tasks.get({ tasklist: mirror.tasklistId, task: mirror.taskId });
    const remote = result.data;
    if (remote.deleted) return task;
    const next = {
      ...task,
      title: remote.title || task.title,
      date: remote.due?.slice(0, 10) || task.date,
      completed: remote.status === 'completed',
    };
    if (next.title !== task.title || next.date !== task.date || next.completed !== task.completed) {
      await taskCollection.doc(task.id).set({ title: next.title, date: next.date, completed: next.completed }, { merge: true });
    }
    return next;
  } catch (error) {
    if ((error as { code?: number }).code !== 404) throw error;
    const refs = { ...(task.googleTaskRefs ?? {}) }; delete refs[email];
    const repaired = { ...task, googleTaskRefs: Object.keys(refs).length ? refs : undefined };
    if (!repaired.googleTaskRefs) delete repaired.googleTaskRefs;
    await taskCollection.doc(task.id).set({ googleTaskRefs: refs }, { merge: true });
    return ensureTaskMirror(auth, email, repaired);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, timezone: 'America/Sao_Paulo' }));

app.get('/api/projects', async (_req, res, next) => {
  try {
    let projectSnap = await projectCollection.get();
    if (projectSnap.empty) {
      const defaults: Project[] = [
        { id: 'family', name: 'Casa & família', color: '#A86979', description: 'Planos e combinados da família.' },
        { id: 'pudim', name: 'O Pudim Perfeito', color: '#8C631B', description: 'Rotina e projetos da loja.' },
        { id: 'events', name: 'Eventos', color: '#7A3A54', description: 'Celebrações e momentos especiais.' },
      ];
      await Promise.all(defaults.map(project => projectCollection.doc(project.id).set(project)));
      projectSnap = await projectCollection.get();
    }
    const taskSnap = await taskCollection.get();
    const counts = new Map<string, { total: number; done: number }>();
    taskSnap.docs.forEach(doc => {
      const data = doc.data() as FamilyTask;
      const item = counts.get(data.projectId) ?? { total: 0, done: 0 };
      item.total += 1; if (data.completed) item.done += 1;
      counts.set(data.projectId, item);
    });
    const projects = projectSnap.docs.map(doc => {
      const project = toRecord<Project>(doc);
      const tally = counts.get(project.id) ?? { total: 0, done: 0 };
      return { ...project, taskCount: tally.total, doneCount: tally.done };
    });
    res.json(projects);
  } catch (error) { next(error); }
});

app.post('/api/projects', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Informe o nome do projeto.' });
    const id = req.body.id || randomUUID();
    const project: Project = { id, name, color: req.body.color || '#8C631B', description: req.body.description || '' };
    await projectCollection.doc(id).set(project, { merge: true });
    res.status(201).json(project);
  } catch (error) { next(error); }
});

app.delete('/api/projects/:id', async (req, res, next) => {
  try {
    const linked = await taskCollection.where('projectId', '==', req.params.id).limit(1).get();
    if (!linked.empty) return res.status(409).json({ error: 'Este projeto ainda tem tarefas. Mova ou exclua as tarefas antes de excluir o projeto.' });
    await projectCollection.doc(req.params.id).delete();
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/people', async (_req, res, next) => {
  try { const snap = await peopleCollection.get(); res.json(snap.docs.map(doc => toRecord<Person>(doc))); }
  catch (error) { next(error); }
});

app.post('/api/people', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Informe o nome da pessoa.' });
    const person: Person = { id: req.body.id || randomUUID(), name, role: req.body.role || 'Família', color: req.body.color || '#A86979', email: req.body.email || '' };
    await peopleCollection.doc(person.id).set(person, { merge: true });
    res.status(201).json(person);
  } catch (error) { next(error); }
});

app.delete('/api/people/:id', async (req, res, next) => {
  try { await peopleCollection.doc(req.params.id).delete(); res.status(204).end(); }
  catch (error) { next(error); }
});

app.get('/api/tasks', async (req, res, next) => {
  try {
    const snap = await taskCollection.orderBy('date', 'asc').get();
    const auth = authReq(req).googleClient;
    const email = authReq(req).familyEmail;
    const tasks = await Promise.all(snap.docs.map(async doc => {
      const task = await ensureTaskMirror(auth, email, toRecord<FamilyTask>(doc));
      return syncTaskFromGoogle(auth, email, task);
    }));
    const tombstones = await family.collection('deletedTasks').get();
    const tasksApi = google.tasks({ version: 'v1', auth });
    await Promise.all(tombstones.docs.map(async doc => {
      const data = doc.data() as { googleTaskRefs?: Record<string, { tasklistId: string; taskId: string }> };
      const mirror = data.googleTaskRefs?.[email];
      if (!mirror) return;
      await tasksApi.tasks.delete({ tasklist: mirror.tasklistId, task: mirror.taskId }).catch(() => undefined);
      const remaining = { ...(data.googleTaskRefs ?? {}) }; delete remaining[email];
      if (Object.keys(remaining).length) await doc.ref.update({ googleTaskRefs: remaining }); else await doc.ref.delete();
    }));
    res.json(tasks);
  } catch (error) { next(error); }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    const { title, projectId, category, date, priority } = req.body;
    if (!title || !projectId || !category || !date || !priority?.urgency || !priority?.importance) {
      return res.status(400).json({ error: 'Preencha título, projeto, categoria, data e os dois níveis de prioridade.' });
    }
    if (!categories.has(category)) return res.status(400).json({ error: 'Selecione uma categoria válida.' });
    if (!(await projectCollection.doc(projectId).get()).exists) return res.status(400).json({ error: 'Selecione um projeto válido.' });
    const taskId = req.body.id || randomUUID();
    const ref = taskCollection.doc(taskId);
    const oldSnap = await ref.get();
    const old = oldSnap.exists ? toRecord<FamilyTask>(oldSnap) : undefined;
    const task: FamilyTask = {
      id: taskId, title: String(title).trim(), projectId, category, date,
      time: req.body.time || '', personId: req.body.personId || '', priority,
      complex: Boolean(req.body.complex), completed: Boolean(req.body.completed),
      googleTaskRefs: old?.googleTaskRefs,
    };
    const refs = { ...(task.googleTaskRefs ?? {}) };
    const email = authReq(req).familyEmail;
    const currentMirror = refs[email];
    if (currentMirror && old?.projectId !== projectId) {
      await google.tasks({ version: 'v1', auth: authReq(req).googleClient }).tasks.delete({ tasklist: currentMirror.tasklistId, task: currentMirror.taskId }).catch(() => undefined);
      delete refs[email];
      task.googleTaskRefs = Object.keys(refs).length ? refs : undefined;
    }
    if (!task.googleTaskRefs) delete task.googleTaskRefs;
    await ref.set(task);
    if (currentMirror && old?.projectId === projectId) {
      const notes = JSON.stringify({ agendaFamilia: true, category: task.category, projectId: task.projectId, personId: task.personId || null, priority: task.priority, complex: task.complex, time: task.time || null });
      await google.tasks({ version: 'v1', auth: authReq(req).googleClient }).tasks.patch({
        tasklist: currentMirror.tasklistId, task: currentMirror.taskId,
        requestBody: { title: task.title, due: `${task.date}T00:00:00.000Z`, notes: `Agenda da Família ${notes}`, status: task.completed ? 'completed' : 'needsAction' },
      });
    }
    const mirrored = await ensureTaskMirror(authReq(req).googleClient, authReq(req).familyEmail, task);
    res.status(201).json(mirrored);
  } catch (error) { next(error); }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  try {
    const ref = taskCollection.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    const old = toRecord<FamilyTask>(snap);
    const updated = { ...old, completed: Boolean(req.body.completed) };
    await ref.set({ completed: updated.completed }, { merge: true });
    const email = authReq(req).familyEmail;
    const mirror = updated.googleTaskRefs?.[email];
    if (mirror) await google.tasks({ version: 'v1', auth: authReq(req).googleClient }).tasks.patch({
      tasklist: mirror.tasklistId, task: mirror.taskId,
      requestBody: { status: updated.completed ? 'completed' : 'needsAction' },
    });
    res.json(updated);
  } catch (error) { next(error); }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  try {
    const ref = taskCollection.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(204).end();
    const task = toRecord<FamilyTask>(snap);
    const tasksApi = google.tasks({ version: 'v1', auth: authReq(req).googleClient });
    const refs = { ...(task.googleTaskRefs ?? {}) };
    await family.collection('deletedTasks').doc(task.id).set({ id: task.id, googleTaskRefs: refs, deletedAt: new Date().toISOString() });
    const ownMirror = refs[authReq(req).familyEmail];
    if (ownMirror) {
      await tasksApi.tasks.delete({ tasklist: ownMirror.tasklistId, task: ownMirror.taskId }).catch(() => undefined);
      delete refs[authReq(req).familyEmail];
      await family.collection('deletedTasks').doc(task.id).set({ googleTaskRefs: refs }, { merge: true });
    }
    await ref.delete();
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const from = String(req.query.from ?? ''); const to = String(req.query.to ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'Período inválido.' });
    const calendar = google.calendar({ version: 'v3', auth: authReq(req).googleClient });
    const response = await calendar.events.list({ calendarId, timeMin: `${from}T00:00:00-03:00`, timeMax: `${to}T23:59:59-03:00`, singleEvents: true, orderBy: 'startTime', maxResults: 2500 });
    const events: FamilyEvent[] = (response.data.items ?? []).map(event => {
      const metadata = event.extendedProperties?.private ?? {};
      const start = event.start?.dateTime?.slice(11, 16) || '';
      const end = event.end?.dateTime?.slice(11, 16) || '';
      return {
        id: event.id || '', title: event.summary || '(Sem título)', category: metadata.agendaCategory as FamilyEvent['category'] || 'Pessoal',
        date: event.start?.date || event.start?.dateTime?.slice(0, 10) || from,
        start, end, allDay: Boolean(event.start?.date), location: event.location || '',
        personId: metadata.agendaPersonId || '', calendarId,
      };
    });
    res.json(events);
  } catch (error) { next(error); }
});

app.post('/api/events', async (req, res, next) => {
  try {
    const { title, category, date, allDay } = req.body;
    if (!title || !category || !date) return res.status(400).json({ error: 'Preencha título, categoria e data do compromisso.' });
    if (!categories.has(category)) return res.status(400).json({ error: 'Selecione uma categoria válida.' });
    if (!allDay && (!req.body.start || !req.body.end)) return res.status(400).json({ error: 'Informe os horários de início e fim.' });
    const body: Record<string, unknown> = {
      summary: String(title).trim(), location: req.body.location || '',
      extendedProperties: { private: { agendaCategory: category, agendaPersonId: req.body.personId || '' } },
    };
    if (allDay) body.start = { date }; else {
      body.start = { dateTime: `${date}T${req.body.start}:00`, timeZone: 'America/Sao_Paulo' };
      body.end = { dateTime: `${date}T${req.body.end}:00`, timeZone: 'America/Sao_Paulo' };
    }
    if (allDay) body.end = { date: dateNextDay(date) };
    const calendar = google.calendar({ version: 'v3', auth: authReq(req).googleClient });
    const existingId = String(req.body.id || '');
    const result = existingId
      ? await calendar.events.update({ calendarId, eventId: existingId, requestBody: body })
      : await calendar.events.insert({ calendarId, requestBody: body });
    const event: FamilyEvent = { id: result.data.id || '', title: String(title).trim(), category, date, allDay: Boolean(allDay), start: req.body.start || '', end: req.body.end || '', location: req.body.location || '', personId: req.body.personId || '', calendarId };
    res.status(201).json(event);
  } catch (error) { next(error); }
});

app.delete('/api/events/:id', async (req, res, next) => {
  try {
    await google.calendar({ version: 'v3', auth: authReq(req).googleClient }).events.delete({ calendarId, eventId: req.params.id });
    res.status(204).end();
  } catch (error) { next(error); }
});

function dateNextDay(date: string) {
  const value = new Date(`${date}T12:00:00-03:00`); value.setDate(value.getDate() + 1);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(value);
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Agenda API error:', error);
  const message = error instanceof Error ? error.message : 'Erro interno ao acessar os dados da agenda.';
  res.status(500).json({ error: message });
});

export default app;
