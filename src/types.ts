export const CATEGORIES = [
  'Pessoal', 'O Pudim Perfeito', 'OPP Santa Felicidade', 'Eventos',
  'Fora da Caixa', 'Campina', 'Maria Antônia', 'Médicos', 'Planos',
] as const;

export type Category = typeof CATEGORIES[number];
export type Person = { id: string; name: string; role: string; color: string; email?: string };
export type Project = { id: string; name: string; color: string; description?: string; taskCount?: number; doneCount?: number };
export type Priority = { urgency: 'urgent' | 'notUrgent'; importance: 'important' | 'secondary' };
export type FamilyTask = {
  id: string; title: string; projectId: string; category: Category; date: string;
  time?: string; personId?: string; priority: Priority; complex: boolean; completed: boolean;
  createdBy?: string; googleTaskRefs?: Record<string, { tasklistId: string; taskId: string }>;
};
export type FamilyEvent = {
  id: string; title: string; category: Category; date: string; start?: string; end?: string;
  allDay: boolean; location?: string; personId?: string; calendarId?: string;
};
export type View = 'today' | 'projects' | 'people' | 'calendar';
const demoToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const FAMILY_PEOPLE: Person[] = [
  { id: 'daphne', name: 'Daphne', role: 'Organização da família', color: '#7A3A54', email: 'daphneklann@gmail.com' },
  { id: 'vinicius', name: 'Vinícius', role: 'Família', color: '#8C631B', email: 'vnsnet@gmail.com' },
  { id: 'maria', name: 'Maria Antônia', role: 'Pequenos cuidados', color: '#A86979' },
];

export const SEED_PROJECTS: Project[] = [
  { id: 'home', name: 'Casa & família', color: '#A86979' },
  { id: 'pudim', name: 'O Pudim Perfeito', color: '#8C631B' },
  { id: 'events', name: 'Eventos', color: '#7A3A54' },
];

export const SEED_TASKS: FamilyTask[] = [
  { id: 'demo-1', title: 'Conferir os documentos da consulta', projectId: 'home', category: 'Médicos', date: demoToday, time: '09:30', personId: 'maria', priority: { urgency: 'urgent', importance: 'important' }, complex: false, completed: false },
  { id: 'demo-2', title: 'Planejar as compras da semana', projectId: 'home', category: 'Pessoal', date: demoToday, time: '16:00', personId: 'daphne', priority: { urgency: 'notUrgent', importance: 'important' }, complex: false, completed: false },
  { id: 'demo-3', title: 'Organizar a próxima comemoração', projectId: 'events', category: 'Eventos', date: demoToday, priority: { urgency: 'notUrgent', importance: 'important' }, complex: true, completed: false },
  { id: 'demo-4', title: 'Separar os itens da bolsa da Maria', projectId: 'home', category: 'Maria Antônia', date: demoToday, complex: false, personId: 'maria', priority: { urgency: 'notUrgent', importance: 'secondary' }, completed: true },
];

export const SEED_EVENTS: FamilyEvent[] = [
  { id: 'event-1', title: 'Consulta pediátrica', category: 'Médicos', date: demoToday, start: '10:00', end: '10:45', allDay: false, location: 'Clínica da Família', personId: 'maria' },
  { id: 'event-2', title: 'Almoço em família', category: 'Pessoal', date: demoToday, start: '12:30', end: '14:00', allDay: false, personId: 'vinicius' },
];
