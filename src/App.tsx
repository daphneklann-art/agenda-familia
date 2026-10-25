import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check,
  CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, Cloud, CloudOff,
  Command, ListTodo, LogIn, LogOut, MapPin, Menu, MoreHorizontal, Pencil, Plus,
  Search, Settings2, Sparkles, Trash2, Users, X,
} from 'lucide-react';
import { api } from './api';
import { ALLOWED_EMAILS, auth, googleProvider } from './firebase';
import {
  CATEGORIES, FAMILY_PEOPLE, SEED_EVENTS, SEED_PROJECTS, SEED_TASKS,
  type Category, type FamilyEvent, type FamilyTask, type Person, type Priority, type Project, type View,
} from './types';

const todayISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const COLORS = ['#A86979', '#8C631B', '#7A3A54', '#84917B', '#7F8A9A', '#BD8A68'];
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...options }).format(new Date(`${value}T12:00:00-03:00`));
const uid = () => crypto.randomUUID();
const demoPerson = (email: string) => FAMILY_PEOPLE.find(person => person.email === email)?.name ?? email;

type Toast = { message: string; type: 'success' | 'error' } | null;
type TaskDraft = Partial<FamilyTask>;
type EventDraft = Partial<FamilyEvent>;

function App() {
  const [view, setView] = useState<View>('today');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [categoryFilter, setCategoryFilter] = useState<Category | 'Todas'>('Todas');
  const [matrixView, setMatrixView] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<TaskDraft | null>(null);
  const [eventModal, setEventModal] = useState<EventDraft | null>(null);
  const [projectModal, setProjectModal] = useState<Partial<Project> | null>(null);
  const [personModal, setPersonModal] = useState<Partial<Person> | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [tasks, setTasks] = useState<FamilyTask[]>(SEED_TASKS);
  const [events, setEvents] = useState<FamilyEvent[]>(SEED_EVENTS);
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [people, setPeople] = useState<Person[]>(FAMILY_PEOPLE);
  const [personStatus, setPersonStatus] = useState<'pending' | 'completed' | 'all'>('pending');
  const [monthCursor, setMonthCursor] = useState(new Date(`${selectedDate}T12:00:00-03:00`));
  const [search, setSearch] = useState('');

  const connected = Boolean(accessToken);
  const context = useMemo(() => accessToken ? { accessToken } : null, [accessToken]);
  const activeProject = projects.find(project => project.id === selectedProject) ?? null;
  const activePerson = people.find(person => person.id === selectedPerson) ?? null;

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshConnected = useCallback(async (ctx: { accessToken: string }) => {
    setLoading(true); setError('');
    try {
      const [nextProjects, nextPeople, nextTasks] = await Promise.all([
        api.projects(ctx), api.people(ctx), api.tasks(ctx),
      ]);
      setProjects(nextProjects); setPeople([...FAMILY_PEOPLE, ...nextPeople.filter(person => !FAMILY_PEOPLE.some(base => base.id === person.id))]);
      setTasks(nextTasks);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao carregar sua agenda.';
      setError(message); notify(message, 'error');
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => {
    if (context) void refreshConnected(context);
  }, [context, refreshConnected]);

  useEffect(() => {
    if (!context) return;
    const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1, 12);
    const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0, 12);
    const from = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(monthStart);
    const to = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(monthEnd);
    void api.events(context, from, to).then(setEvents).catch(e => notify(e instanceof Error ? e.message : 'Não foi possível carregar o mês.', 'error'));
  }, [context, monthCursor, notify]);

  useEffect(() => {
    setMonthCursor(new Date(`${selectedDate}T12:00:00-03:00`));
  }, [selectedDate]);

  const visibleTasks = useMemo(() => tasks.filter(task =>
    task.date === selectedDate && (categoryFilter === 'Todas' || task.category === categoryFilter) &&
    (!search || task.title.toLowerCase().includes(search.toLowerCase()))), [tasks, selectedDate, categoryFilter, search]);
  const visibleEvents = useMemo(() => events.filter(event => event.date === selectedDate &&
    (categoryFilter === 'Todas' || event.category === categoryFilter)), [events, selectedDate, categoryFilter]);
  const pending = visibleTasks.filter(task => !task.completed);
  const complete = visibleTasks.filter(task => task.completed);
  const complexTasks = pending.filter(task => task.complex);
  const standardTasks = pending.filter(task => !task.complex);

  const saveTask = async (draft: TaskDraft) => {
    const task: FamilyTask = {
      id: draft.id || uid(), title: draft.title?.trim() || '', projectId: draft.projectId || projects[0]?.id || '',
      category: (draft.category as Category) || 'Pessoal', date: draft.date || selectedDate, time: draft.time || '',
      personId: draft.personId || '', priority: draft.priority || { urgency: 'notUrgent', importance: 'important' },
      complex: Boolean(draft.complex), completed: Boolean(draft.completed),
    };
    if (context) {
      try {
        const saved = await api.saveTask(context, task);
        setTasks(old => [saved, ...old.filter(item => item.id !== saved.id)]);
        void refreshConnected(context);
        notify(draft.id ? 'Tarefa atualizada.' : 'Tarefa adicionada ao Google Tasks.');
      } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar a tarefa.', 'error'); return; }
    } else {
      setTasks(old => draft.id ? old.map(item => item.id === draft.id ? { ...task } : item) : [{ ...task }, ...old]);
      notify('Tarefa adicionada no modo demonstração.');
    }
    setTaskModal(null);
  };

  const toggleTask = async (task: FamilyTask) => {
    const completed = !task.completed;
    if (context) {
      try { const saved = await api.completeTask(context, task.id, completed); setTasks(old => old.map(item => item.id === task.id ? saved : item)); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível atualizar a tarefa.', 'error'); }
    } else setTasks(old => old.map(item => item.id === task.id ? { ...item, completed } : item));
  };

  const removeTask = async (task: FamilyTask) => {
    if (!window.confirm(`Excluir “${task.title}”? Essa ação não pode ser desfeita.`)) return;
    if (context) {
      try { await api.deleteTask(context, task.id); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', 'error'); return; }
    }
    setTasks(old => old.filter(item => item.id !== task.id)); notify('Tarefa excluída.');
  };

  const saveEvent = async (draft: EventDraft) => {
    const event: FamilyEvent = {
      id: draft.id || '', title: draft.title?.trim() || '', category: (draft.category as Category) || 'Pessoal',
      date: draft.date || selectedDate, start: draft.start || '', end: draft.end || '', allDay: Boolean(draft.allDay),
      location: draft.location || '', personId: draft.personId || '',
    };
    if (context) {
      try { const saved = await api.saveEvent(context, event); setEvents(old => [saved, ...old.filter(item => item.id !== saved.id)]); notify('Compromisso adicionado ao Google Calendar.'); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar o compromisso.', 'error'); return; }
    } else {
      setEvents(old => draft.id ? old.map(item => item.id === draft.id ? { ...event } : item) : [...old, { ...event, id: uid() }]);
      notify('Compromisso adicionado no modo demonstração.');
    }
    setEventModal(null);
  };

  const removeEvent = async (event: FamilyEvent) => {
    if (!window.confirm(`Excluir o compromisso “${event.title}” do calendário?`)) return;
    if (context) {
      try { await api.deleteEvent(context, event.id); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', 'error'); return; }
    }
    setEvents(old => old.filter(item => item.id !== event.id)); notify('Compromisso excluído.');
  };

  const saveProject = async (draft: Partial<Project>) => {
    const project: Project = { id: draft.id || uid(), name: draft.name?.trim() || '', color: draft.color || COLORS[0], description: draft.description || '' };
    if (context) {
      try { const saved = await api.saveProject(context, project); setProjects(old => draft.id ? old.map(item => item.id === saved.id ? saved : item) : [...old, saved]); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar o projeto.', 'error'); return; }
    } else setProjects(old => draft.id ? old.map(item => item.id === project.id ? project : item) : [...old, project]);
    setProjectModal(null); notify('Projeto salvo.');
  };

  const removeProject = async (project: Project) => {
    if (!window.confirm(`Excluir o projeto “${project.name}”?`)) return;
    if (tasks.some(task => task.projectId === project.id)) { notify('Mova ou exclua as tarefas deste projeto antes de removê-lo.', 'error'); return; }
    if (context) {
      try { await api.deleteProject(context, project.id); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', 'error'); return; }
    }
    setProjects(old => old.filter(item => item.id !== project.id)); setSelectedProject(null); notify('Projeto excluído.');
  };

  const savePerson = async (draft: Partial<Person>) => {
    const person: Person = { id: draft.id || uid(), name: draft.name?.trim() || '', role: draft.role || 'Família', color: draft.color || COLORS[0], email: draft.email || '' };
    if (context) {
      try { const saved = await api.savePerson(context, person); setPeople(old => [...old.filter(item => item.id !== saved.id), saved]); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar a pessoa.', 'error'); return; }
    } else setPeople(old => [...old.filter(item => item.id !== person.id), person]);
    setPersonModal(null); notify('Pessoa adicionada.');
  };

  const removePerson = async (person: Person) => {
    if (FAMILY_PEOPLE.some(item => item.id === person.id)) { notify('Os membros da família principal não podem ser removidos.', 'error'); return; }
    if (!window.confirm(`Remover ${person.name} dos contatos frequentes?`)) return;
    if (context) {
      try { await api.deletePerson(context, person.id); }
      catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível remover.', 'error'); return; }
    }
    setPeople(old => old.filter(item => item.id !== person.id)); setSelectedPerson(null); notify('Pessoa removida.');
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true); setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accountEmail = result.user.email?.toLowerCase() || '';
      if (!ALLOWED_EMAILS.includes(accountEmail)) {
        await signOut(auth);
        throw new Error('Acesso restrito a Daphne (daphneklann@gmail.com) e Vinícius (vnsnet@gmail.com).');
      }
      if (!credential?.accessToken) throw new Error('O Google não retornou autorização para Calendar e Tasks. Tente novamente.');
      setEmail(accountEmail); setAccessToken(credential.accessToken);
      notify(`Bem-vinda, ${demoPerson(accountEmail)}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível entrar com Google.';
      setError(message); notify(message, 'error');
    } finally { setAuthBusy(false); }
  };

  const handleSignOut = async () => { await signOut(auth).catch(() => undefined); setAccessToken(null); setEmail(null); setTasks(SEED_TASKS); setEvents(SEED_EVENTS); setProjects(SEED_PROJECTS); setPeople(FAMILY_PEOPLE); };

  const navItems: { id: View; label: string; icon: typeof CalendarDays }[] = [
    { id: 'today', label: 'Hoje', icon: CalendarDays }, { id: 'projects', label: 'Projetos', icon: Command },
    { id: 'people', label: 'Pessoas', icon: Users }, { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  ];

  const moveDate = (days: number) => {
    const next = new Date(`${selectedDate}T12:00:00-03:00`); next.setDate(next.getDate() + days);
    setSelectedDate(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(next));
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-mark"><span>A</span><i>F</i></div>
        <div><div className="brand-title">Agenda da Família</div><div className="brand-subtitle">Daphne <span>&</span> Vinícius</div></div>
        <button className="icon-button sidebar-close" aria-label="Fechar navegação" onClick={() => setMobileMenu(false)}><X size={18} /></button>
      </div>
      <div className="sidebar-caption">ESPAÇO DA FAMÍLIA</div>
      <nav className="side-nav" aria-label="Navegação principal">
        {navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-link ${view === item.id ? 'active' : ''}`} onClick={() => { setView(item.id); setMobileMenu(false); setSelectedPerson(null); setSelectedProject(null); }}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'today' && pending.length > 0 && <small>{pending.length}</small>}</button>; })}
      </nav>
      <div className="sidebar-grow" />
      <div className="sidebar-note"><Sparkles size={16} /><span>Um espaço leve para organizar o que importa.</span></div>
      <div className="sidebar-account">
        <div className="avatar avatar-daphne">D</div>
        <div className="account-copy"><strong>{connected ? demoPerson(email || '') : 'Modo demonstração'}</strong><span>{connected ? email : 'Seus dados ficam neste navegador'}</span></div>
        {connected ? <button className="icon-button" title="Sair" onClick={handleSignOut}><LogOut size={17} /></button> : <button className="icon-button" title={authBusy ? 'Conectando...' : 'Conectar Google'} onClick={handleGoogleSignIn} disabled={authBusy}><LogIn size={17} /></button>}
      </div>
    </aside>

    {mobileMenu && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileMenu(false)} />}

    <main className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu-button" aria-label="Abrir menu" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
        <div className="breadcrumbs"><span>Família</span><ChevronRight size={14} /><strong>{view === 'today' ? 'Hoje' : view === 'projects' ? 'Projetos' : view === 'people' ? 'Pessoas' : 'Calendário'}</strong></div>
        <div className="topbar-actions">
          <label className="search-box"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarefas" /></label>
          <button className="connection-pill" onClick={connected ? handleSignOut : handleGoogleSignIn} title={connected ? `Conectada como ${email}` : 'Conectar Google Calendar e Tasks'} disabled={authBusy}>
            {connected ? <Cloud size={15} /> : <CloudOff size={15} />}<span>{connected ? 'Google conectado' : authBusy ? 'Conectando...' : 'Demonstração'}</span>
          </button>
          <div className="avatar avatar-daphne top-avatar">{connected ? demoPerson(email || '')[0] : 'D'}</div>
        </div>
      </header>

      {error && <div className="inline-alert"><AlertCircle size={17} /><span>{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={16} /></button></div>}

      <div className="page-container">
        {view === 'today' && <>
          <section className="welcome-row">
            <div><div className="eyebrow">SEU TEMPO, COM MAIS INTENÇÃO</div><h1>Olá, {connected ? demoPerson(email || '') : 'Daphne'} <span className="wave">✳</span></h1><p>Um dia de cada vez, com espaço para o que importa.</p></div>
            <button className="primary-button" onClick={() => setTaskModal({ date: selectedDate })}><Plus size={17} /> Nova tarefa</button>
          </section>
          <section className="date-toolbar">
            <div className="date-navigation"><button className="date-arrow" aria-label="Dia anterior" onClick={() => moveDate(-1)}><ChevronLeft size={18} /></button><button className="date-title" onClick={() => setDatePickerOpen(v => !v)}><span>{dateLabel(selectedDate)}</span><ChevronDown size={15} /></button><button className="date-arrow" aria-label="Próximo dia" onClick={() => moveDate(1)}><ChevronRight size={18} /></button><button className="today-chip" onClick={() => setSelectedDate(todayISO())}>Hoje</button>{datePickerOpen && <input className="date-input" type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setDatePickerOpen(false); }} />}</div>
            <div className="date-tools"><div className="view-switch"><button className={!matrixView ? 'selected' : ''} onClick={() => setMatrixView(false)}><ListTodo size={15} /> Lista do dia</button><button className={matrixView ? 'selected' : ''} onClick={() => setMatrixView(true)}><Settings2 size={15} /> Prioridades</button></div><button className="icon-button outlined" title="Abrir calendário" onClick={() => setView('calendar')}><CalendarDays size={17} /></button></div>
          </section>
          <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
          {matrixView ? <PriorityMatrix tasks={pending} onToggle={toggleTask} onEdit={setTaskModal} onDelete={removeTask} projects={projects} people={people} /> : <div className="today-grid">
            <div className="primary-column">
              <section className="panel appointments-panel">
                <PanelHeading icon={<CalendarDays size={18} />} eyebrow="SEU DIA EM FOCO" title="Compromissos" count={visibleEvents.length} action={<button className="text-button" onClick={() => setEventModal({ date: selectedDate })}><Plus size={15} /> Agendar</button>} />
                {visibleEvents.length ? <div className="timeline">{visibleEvents.map(event => <EventRow key={event.id} event={event} people={people} onEdit={() => setEventModal(event)} onDelete={() => void removeEvent(event)} />)}</div> : <EmptyState icon={<CalendarDays size={19} />} title="Agenda aberta por enquanto" detail="Adicione um compromisso para deixar seu dia bem cuidado." action={<button className="text-button" onClick={() => setEventModal({ date: selectedDate })}><Plus size={15} /> Agendar compromisso</button>} />}
                <button className="quick-add" onClick={() => setEventModal({ date: selectedDate })}><Plus size={16} /><span>Adicionar compromisso rápido</span><ArrowRight size={15} /></button>
              </section>
              <section className="panel tasks-panel">
                <PanelHeading icon={<CheckCheck size={18} />} eyebrow="PEQUENOS PASSOS" title="Tarefas do dia" count={standardTasks.length} action={<button className="icon-button soft" aria-label="Nova tarefa" onClick={() => setTaskModal({ date: selectedDate })}><Plus size={17} /></button>} />
                {standardTasks.length ? <div className="task-list">{standardTasks.map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => void toggleTask(task)} onEdit={() => setTaskModal(task)} onDelete={() => void removeTask(task)} />)}</div> : <EmptyState icon={<ListTodo size={18} />} title="Um espaço em branco, sem pressa" detail="Quando surgir uma tarefa, ela fica guardada aqui." action={<button className="text-button" onClick={() => setTaskModal({ date: selectedDate })}><Plus size={15} /> Criar tarefa</button>} />}
                <button className={`history-toggle ${historyOpen ? 'opened' : ''}`} onClick={() => setHistoryOpen(v => !v)}><span><Check size={15} /> Histórico do dia</span><span className="history-count">{complete.length}</span><ChevronDown size={16} /></button>
                {historyOpen && <div className="task-list history-list">{complete.length ? complete.map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => void toggleTask(task)} onEdit={() => setTaskModal(task)} onDelete={() => void removeTask(task)} />) : <p className="history-empty">As tarefas concluídas por aqui aparecem neste histórico.</p>}</div>}
              </section>
            </div>
            <div className="secondary-column">
              <section className="panel complex-panel">
                <PanelHeading icon={<Sparkles size={18} />} eyebrow="PASSO A PASSO" title="Tarefas complexas" count={complexTasks.length} action={<button className="icon-button soft" aria-label="Nova tarefa complexa" onClick={() => setTaskModal({ date: selectedDate, complex: true })}><Plus size={17} /></button>} />
                {complexTasks.length ? <div className="complex-list">{complexTasks.map(task => <ComplexCard key={task.id} task={task} project={projects.find(project => project.id === task.projectId)} person={people.find(person => person.id === task.personId)} onOpen={() => setTaskModal(task)} onToggle={() => void toggleTask(task)} />)}</div> : <div className="complex-empty"><div className="sparkle-orbit"><Sparkles size={22} /></div><strong>Projetos grandes começam por um passo</strong><span>Separe aqui as tarefas que pedem mais planejamento.</span><button className="text-button" onClick={() => setTaskModal({ date: selectedDate, complex: true })}><Plus size={15} /> Criar tarefa complexa</button></div>}
              </section>
              <section className="panel people-panel">
                <PanelHeading icon={<Users size={18} />} eyebrow="QUEM FAZ PARTE" title="Pessoas" action={<button className="icon-button soft" aria-label="Adicionar pessoa" onClick={() => setPersonModal({})}><Plus size={17} /></button>} />
                <div className="people-list">{people.slice(0, 4).map(person => <PersonRow key={person.id} person={person} tasks={tasks} onClick={() => { setSelectedPerson(person.id); setView('people'); }} />)}</div>
                <button className="subtle-link" onClick={() => setView('people')}>Ver pessoas e pendências <ArrowRight size={14} /></button>
              </section>
              <section className="today-note"><span className="note-mark">“</span><p>Organização boa é aquela que deixa espaço para viver o dia.</p><span className="note-byline">UM LEMBRETE DE FAMÍLIA</span></section>
            </div>
          </div>}
        </>}

        {view === 'projects' && <>
          <section className="welcome-row"><div><div className="eyebrow">PLANOS QUE GANHAM FORMA</div><h1>Projetos</h1><p>Veja o que já foi feito e qual é o próximo passo.</p></div><button className="primary-button" onClick={() => setProjectModal({})}><Plus size={17} /> Novo projeto</button></section>
          <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
          {activeProject ? <section className="panel project-detail">
            <div className="project-detail-heading"><button className="back-link" onClick={() => setSelectedProject(null)}><ArrowLeft size={16} /> Todos os projetos</button><div className="project-detail-actions"><button className="icon-button soft" aria-label="Editar projeto" onClick={() => setProjectModal(activeProject)}><Pencil size={16} /></button><button className="icon-button soft danger-hover" aria-label="Excluir projeto" onClick={() => void removeProject(activeProject)}><Trash2 size={16} /></button></div></div>
            <div className="project-detail-title"><span className="project-color-dot" style={{ backgroundColor: activeProject.color }} /><div><div className="eyebrow">PROJETO DA FAMÍLIA</div><h2>{activeProject.name}</h2>{activeProject.description && <p>{activeProject.description}</p>}</div></div>
            <div className="project-detail-progress"><ProjectProgress project={activeProject} tasks={tasks} /><button className="primary-button small" onClick={() => setTaskModal({ projectId: activeProject.id, date: selectedDate })}><Plus size={15} /> Nova tarefa</button></div>
            <div className="project-task-list">{tasks.filter(task => task.projectId === activeProject.id && (categoryFilter === 'Todas' || task.category === categoryFilter)).map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => void toggleTask(task)} onEdit={() => setTaskModal(task)} onDelete={() => void removeTask(task)} />)}{!tasks.some(task => task.projectId === activeProject.id) && <EmptyState icon={<ListTodo size={18} />} title="Este projeto está começando" detail="Adicione a primeira tarefa para ver o progresso por aqui." action={<button className="text-button" onClick={() => setTaskModal({ projectId: activeProject.id, date: selectedDate })}><Plus size={15} /> Criar primeira tarefa</button>} />}</div>
          </section> : <div className="project-grid">{projects.map(project => <ProjectCard key={project.id} project={project} tasks={tasks} onOpen={() => setSelectedProject(project.id)} onEdit={() => setProjectModal(project)} />)}<button className="add-project-card" onClick={() => setProjectModal({})}><span className="add-project-icon"><Plus size={21} /></span><strong>Criar novo projeto</strong><span>Dê forma a um novo plano da família</span></button></div>}
        </>}

        {view === 'people' && <>
          <section className="welcome-row"><div><div className="eyebrow">A VIDA ACONTECE JUNTO</div><h1>{activePerson ? activePerson.name : 'Pessoas'}</h1><p>{activePerson ? 'Pendências, tarefas concluídas e combinados.' : 'Quem está por perto em cada plano.'}</p></div><button className="primary-button" onClick={() => setPersonModal({})}><Plus size={17} /> Adicionar pessoa</button></section>
          <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
          {activePerson ? <section className="panel person-detail">
            <button className="back-link" onClick={() => setSelectedPerson(null)}><ArrowLeft size={16} /> Todas as pessoas</button>
            <div className="person-detail-hero"><div className="avatar person-large" style={{ backgroundColor: activePerson.color }}>{activePerson.name.charAt(0)}</div><div><div className="eyebrow">{activePerson.role}</div><h2>{activePerson.name}</h2>{activePerson.email && <span className="person-email">{activePerson.email}</span>}</div><div className="person-detail-tools"><select className="select-pill" value={personStatus} onChange={e => setPersonStatus(e.target.value as typeof personStatus)}><option value="pending">Pendentes</option><option value="completed">Concluídas</option><option value="all">Todas</option></select>{!FAMILY_PEOPLE.some(item => item.id === activePerson.id) && <button className="icon-button soft danger-hover" aria-label="Remover pessoa" onClick={() => void removePerson(activePerson)}><Trash2 size={16} /></button>}</div></div>
            <div className="person-stats"><span><strong>{tasks.filter(task => task.personId === activePerson.id && !task.completed).length}</strong> pendentes</span><span><strong>{tasks.filter(task => task.personId === activePerson.id && task.completed).length}</strong> concluídas</span><span><strong>{events.filter(event => event.personId === activePerson.id).length}</strong> compromissos</span></div>
            <div className="project-task-list">{tasks.filter(task => task.personId === activePerson.id && (personStatus === 'all' || (personStatus === 'completed') === task.completed) && (categoryFilter === 'Todas' || task.category === categoryFilter)).map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => void toggleTask(task)} onEdit={() => setTaskModal(task)} onDelete={() => void removeTask(task)} />)}{events.filter(event => event.personId === activePerson.id && (categoryFilter === 'Todas' || event.category === categoryFilter)).map(event => <div className="person-event-row" key={event.id}><CalendarDays size={17} /><span>{event.title}</span><time>{dateLabel(event.date, { day: 'numeric', month: 'short' })}{event.start ? ` · ${event.start}` : ''}</time><button className="icon-button" aria-label="Excluir compromisso" onClick={() => void removeEvent(event)}><Trash2 size={15} /></button></div>)}</div>
          </section> : <div className="people-grid">{people.map(person => <PersonCard key={person.id} person={person} tasks={tasks} onOpen={() => setSelectedPerson(person.id)} />)}</div>}
        </>}

        {view === 'calendar' && <>
          <section className="welcome-row"><div><div className="eyebrow">TODAS AS DATAS, NO SEU RITMO</div><h1>Calendário</h1><p>Compromissos e tarefas do mês em um só lugar.</p></div><button className="primary-button" onClick={() => setEventModal({ date: selectedDate })}><Plus size={17} /> Novo compromisso</button></section>
          <CategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
          <section className="panel month-panel"><div className="month-heading"><div><span className="eyebrow">VISÃO MENSAL</span><h2>{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(monthCursor)}</h2></div><div className="month-nav"><button className="icon-button outlined" aria-label="Mês anterior" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button><button className="today-chip" onClick={() => { setSelectedDate(todayISO()); setMonthCursor(new Date()); }}>Hoje</button><button className="icon-button outlined" aria-label="Próximo mês" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button></div></div><MonthGrid cursor={monthCursor} selectedDate={selectedDate} events={events} tasks={tasks} category={categoryFilter} onSelect={setSelectedDate} onAddEvent={(day) => setEventModal({ date: day })} onAddTask={(day) => setTaskModal({ date: day })} />
            <div className="month-day-agenda"><div className="month-day-title"><div><span className="eyebrow">DIA SELECIONADO</span><h3>{dateLabel(selectedDate)}</h3></div><div className="day-agenda-actions"><button className="text-button" onClick={() => setTaskModal({ date: selectedDate })}><Plus size={14} /> Tarefa</button><button className="text-button" onClick={() => setEventModal({ date: selectedDate })}><Plus size={14} /> Compromisso</button></div></div>
              {visibleEvents.map(event => <EventRow key={event.id} event={event} people={people} onEdit={() => setEventModal(event)} onDelete={() => void removeEvent(event)} />)}
              {visibleTasks.map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => void toggleTask(task)} onEdit={() => setTaskModal(task)} onDelete={() => void removeTask(task)} />)}
              {!visibleEvents.length && !visibleTasks.length && <p className="day-agenda-empty">Nenhum compromisso ou tarefa para esta data.</p>}
            </div>
          </section>
        </>}
      </div>
    </main>

    <footer className="mobile-bottom-nav">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setSelectedPerson(null); setSelectedProject(null); }}><Icon size={19} /><span>{item.label}</span></button>; })}</footer>

    {taskModal && <TaskModal initial={taskModal} projects={projects} people={people} onClose={() => setTaskModal(null)} onSave={saveTask} />}
    {eventModal && <EventModal initial={eventModal} people={people} onClose={() => setEventModal(null)} onSave={saveEvent} />}
    {projectModal && <ProjectModal initial={projectModal} onClose={() => setProjectModal(null)} onSave={saveProject} />}
    {personModal && <PersonModal initial={personModal} onClose={() => setPersonModal(null)} onSave={savePerson} />}
    {loading && <div className="loading-indicator"><span /> Sincronizando...</div>}
    {toast && <div className={`toast ${toast.type}`}><span>{toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}</span>{toast.message}</div>}
  </div>;
}

function CategoryFilter({ value, onChange }: { value: Category | 'Todas'; onChange: (category: Category | 'Todas') => void }) {
  return <div className="category-toolbar"><div><span className="filter-label">CATEGORIA</span><div className="category-select-wrap"><select value={value} onChange={e => onChange(e.target.value as Category | 'Todas')} aria-label="Filtrar por categoria"><option>Todas</option>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select><ChevronDown size={15} /></div></div><div className="category-hint">{value === 'Todas' ? 'Mostrando todas as categorias' : `Filtrando por ${value}`}</div></div>;
}

function PanelHeading({ icon, eyebrow, title, count, action }: { icon: ReactNode; eyebrow: string; title: string; count?: number; action?: ReactNode }) {
  return <div className="panel-heading"><div className="heading-icon">{icon}</div><div className="panel-heading-copy"><span className="eyebrow">{eyebrow}</span><h2>{title}{count !== undefined && <span className="count-badge">{count}</span>}</h2></div>{action && <div className="panel-action">{action}</div>}</div>;
}

function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{detail}</span>{action}</div>;
}

function EventRow({ event, people, onEdit, onDelete }: { event: FamilyEvent; people: Person[]; onEdit: () => void; onDelete: () => void }) {
  const person = people.find(item => item.id === event.personId);
  return <div className="event-row"><div className="event-time">{event.allDay ? <span>Dia inteiro</span> : <><strong>{event.start}</strong><i />{event.end && <span>{event.end}</span>}</>}</div><div className="event-marker" /><div className="event-content"><div className="event-title-row"><strong>{event.title}</strong><div className="row-actions"><button className="icon-button" aria-label="Editar compromisso" onClick={onEdit}><Pencil size={14} /></button><button className="icon-button danger-hover" aria-label="Excluir compromisso" onClick={onDelete}><Trash2 size={14} /></button></div></div><div className="event-meta"><CategoryBadge category={event.category} />{event.location && <span><MapPin size={13} />{event.location}</span>}{person && <span><span className="mini-dot" style={{ backgroundColor: person.color }} />{person.name}</span>}</div></div></div>;
}

function TaskRow({ task, projects, people, onToggle, onEdit, onDelete }: { task: FamilyTask; projects: Project[]; people: Person[]; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const project = projects.find(item => item.id === task.projectId);
  const person = people.find(item => item.id === task.personId);
  return <div className={`task-row ${task.completed ? 'task-complete' : ''}`}>
    <button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Reabrir tarefa' : 'Concluir tarefa'} onClick={onToggle}>{task.completed ? <Check size={13} strokeWidth={3} /> : <Circle size={18} strokeWidth={1.55} />}</button>
    <div className="task-copy"><div className="task-title-line"><strong>{task.title}</strong>{task.time && <span className="task-time"><Clock3 size={12} />{task.time}</span>}</div><div className="task-meta"><CategoryBadge category={task.category} />{project && <span className="task-project"><span className="mini-dot" style={{ backgroundColor: project.color }} />{project.name}</span>}{person && <span className="task-person"><span className="mini-dot" style={{ backgroundColor: person.color }} />{person.name}</span>}</div></div>
    <div className="task-priority" title={`${task.priority.urgency === 'urgent' ? 'Urgente' : 'Não urgente'} · ${task.priority.importance === 'important' ? 'Importante' : 'Secundário'}`}><span className={`${task.priority.urgency === 'urgent' ? 'priority-hot' : 'priority-calm'}`} /><span>{task.priority.importance === 'important' ? <Sparkles size={13} /> : <Circle size={12} />}</span></div>
    <div className="row-actions"><button className="icon-button" aria-label="Editar tarefa" onClick={onEdit}><Pencil size={14} /></button><button className="icon-button danger-hover" aria-label="Excluir tarefa" onClick={onDelete}><Trash2 size={14} /></button></div>
  </div>;
}

function CategoryBadge({ category }: { category: Category }) {
  return <span className={`category-badge badge-${CATEGORIES.indexOf(category) % 5}`}>{category}</span>;
}

function ComplexCard({ task, project, person, onOpen, onToggle }: { task: FamilyTask; project?: Project; person?: Person; onOpen: () => void; onToggle: () => void }) {
  return <div className="complex-card"><button className="task-check" aria-label="Concluir tarefa complexa" onClick={onToggle}><Circle size={18} strokeWidth={1.55} /></button><button className="complex-card-copy" onClick={onOpen}><strong>{task.title}</strong><span>{project?.name ?? 'Projeto'}{task.time ? ` · ${task.time}` : ''}</span><div><CategoryBadge category={task.category} />{person && <span className="complex-person"><span className="mini-dot" style={{ backgroundColor: person.color }} />{person.name}</span>}</div></button><button className="icon-button" aria-label="Editar tarefa complexa" onClick={onOpen}><Pencil size={14} /></button></div>;
}

function PersonRow({ person, tasks, onClick }: { person: Person; tasks: FamilyTask[]; onClick: () => void }) {
  const count = tasks.filter(task => task.personId === person.id && !task.completed).length;
  return <button className="person-row" onClick={onClick}><span className="avatar" style={{ backgroundColor: person.color }}>{person.name.charAt(0)}</span><span className="person-row-copy"><strong>{person.name}</strong><small>{person.role}</small></span><span className={`person-count ${count ? 'has-pending' : ''}`}>{count}</span><ChevronRight size={15} /></button>;
}

function PersonCard({ person, tasks, onOpen }: { person: Person; tasks: FamilyTask[]; onOpen: () => void }) {
  const assigned = tasks.filter(task => task.personId === person.id);
  const pending = assigned.filter(task => !task.completed).length;
  const complete = assigned.length - pending;
  return <button className="person-card" onClick={onOpen}><div className="person-card-top"><span className="avatar person-large" style={{ backgroundColor: person.color }}>{person.name.charAt(0)}</span><span className="person-card-open"><ArrowRight size={16} /></span></div><div className="eyebrow">{person.role}</div><h3>{person.name}</h3>{person.email && <span className="person-email">{person.email}</span>}<div className="person-card-stats"><span><strong>{pending}</strong> pendentes</span><span><strong>{complete}</strong> concluídas</span></div></button>;
}

function ProjectProgress({ project, tasks }: { project: Project; tasks: FamilyTask[] }) {
  const linked = tasks.filter(task => task.projectId === project.id);
  const done = linked.filter(task => task.completed).length;
  const progress = linked.length ? Math.round(done / linked.length * 100) : 0;
  return <div className="project-progress-block"><div className="progress-labels"><span>{linked.length} {linked.length === 1 ? 'tarefa' : 'tarefas'}</span><span><strong>{progress}%</strong> concluído</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: project.color }} /></div><div className="progress-stats"><span>{linked.length - done} pendentes</span><span>{done} concluídas</span></div></div>;
}

function ProjectCard({ project, tasks, onOpen, onEdit }: { project: Project; tasks: FamilyTask[]; onOpen: () => void; onEdit: () => void }) {
  const linked = tasks.filter(task => task.projectId === project.id); const done = linked.filter(task => task.completed).length;
  const percent = linked.length ? Math.round(done / linked.length * 100) : 0;
  return <article className="project-card"><div className="project-card-top"><span className="project-monogram" style={{ backgroundColor: `${project.color}16`, color: project.color }}><Command size={21} /></span><button className="icon-button" aria-label="Editar projeto" onClick={onEdit}><MoreHorizontal size={18} /></button></div><button className="project-card-main" onClick={onOpen}><div className="eyebrow">{linked.length} {linked.length === 1 ? 'TAREFA' : 'TAREFAS'}</div><h3>{project.name}</h3>{project.description && <p>{project.description}</p>}<div className="project-card-progress"><div className="progress-labels"><span>Progresso</span><strong>{percent}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: project.color }} /></div></div><div className="project-card-footer"><span>{linked.length - done} pendentes</span><span>{done} concluídas <ArrowRight size={13} /></span></div></button></article>;
}

function PriorityMatrix({ tasks, onToggle, onEdit, onDelete, projects, people }: { tasks: FamilyTask[]; onToggle: (task: FamilyTask) => void; onEdit: (task: FamilyTask) => void; onDelete: (task: FamilyTask) => void; projects: Project[]; people: Person[] }) {
  const quadrants: { urgency: Priority['urgency']; importance: Priority['importance']; title: string; label: string; icon: ReactNode; tone: string }[] = [
    { urgency: 'urgent', importance: 'important', title: 'Fazer agora', label: 'URGENTE · IMPORTANTE', icon: <ArrowUp size={16} />, tone: 'matrix-now' },
    { urgency: 'notUrgent', importance: 'important', title: 'Planejar e agendar', label: 'NÃO URGENTE · IMPORTANTE', icon: <CalendarDays size={16} />, tone: 'matrix-plan' },
    { urgency: 'urgent', importance: 'secondary', title: 'Resolver rápido / delegar', label: 'URGENTE · SECUNDÁRIO', icon: <ArrowRight size={16} />, tone: 'matrix-delegate' },
    { urgency: 'notUrgent', importance: 'secondary', title: 'Quando sobrar tempo', label: 'NÃO URGENTE · SECUNDÁRIO', icon: <ArrowDown size={16} />, tone: 'matrix-later' },
  ];
  return <div className="matrix-grid">{quadrants.map(q => { const rows = tasks.filter(task => task.priority.urgency === q.urgency && task.priority.importance === q.importance); return <section className={`panel matrix-quadrant ${q.tone}`} key={q.title}><div className="matrix-head"><span className="matrix-icon">{q.icon}</span><div><span className="eyebrow">{q.label}</span><h2>{q.title}</h2></div><span className="count-badge">{rows.length}</span></div><div className="matrix-tasks">{rows.length ? rows.map(task => <TaskRow key={task.id} task={task} projects={projects} people={people} onToggle={() => onToggle(task)} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />) : <div className="matrix-empty">Nenhuma tarefa por aqui.</div>}</div></section>; })}</div>;
}

function MonthGrid({ cursor, selectedDate, events, tasks, category, onSelect, onAddEvent, onAddTask }: { cursor: Date; selectedDate: string; events: FamilyEvent[]; tasks: FamilyTask[]; category: Category | 'Todas'; onSelect: (date: string) => void; onAddEvent: (date: string) => void; onAddTask: (date: string) => void }) {
  const year = cursor.getFullYear(); const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > daysInMonth ? null : `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
  const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return <div className="month-grid-wrap"><div className="weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="month-grid">{cells.map((day, index) => {
    if (!day) return <div className="month-cell blank" key={`blank-${index}`} />;
    const dayEvents = events.filter(event => event.date === day && (category === 'Todas' || event.category === category));
    const dayTasks = tasks.filter(task => task.date === day && (category === 'Todas' || task.category === category));
    return <button key={day} className={`month-cell ${selectedDate === day ? 'selected' : ''} ${day === todayISO() ? 'is-today' : ''}`} onClick={() => onSelect(day)} onDoubleClick={() => onAddEvent(day)}>
      <span className="day-number">{Number(day.slice(-2))}</span>
      <div className="day-indicators">{dayEvents.slice(0, 2).map(event => <span className="day-event" key={event.id}><i />{event.title}</span>)}{dayTasks.slice(0, 2).map(task => <span className={`day-task ${task.completed ? 'done' : ''}`} key={task.id}><i />{task.title}</span>)}{dayEvents.length + dayTasks.length > 4 && <span className="more-events">+{dayEvents.length + dayTasks.length - 4} itens</span>}</div>
      <span className="cell-actions"><span onClick={e => { e.stopPropagation(); onAddEvent(day); }} title="Novo compromisso"><CalendarDays size={13} /></span><span onClick={e => { e.stopPropagation(); onAddTask(day); }} title="Nova tarefa"><Plus size={14} /></span></span>
    </button>;
  })}</div></div>;
}

function ModalShell({ title, subtitle, onClose, children, onSubmit, submitLabel = 'Salvar' }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; onSubmit: (event: FormEvent) => void; submitLabel?: string }) {
  return <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-heading"><div><span className="eyebrow">AGENDA DA FAMÍLIA</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={19} /></button></header><form onSubmit={onSubmit}><div className="modal-body">{children}</div><footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">{submitLabel}</button></footer></form></section></div>;
}

function TaskModal({ initial, projects, people, onClose, onSave }: { initial: TaskDraft; projects: Project[]; people: Person[]; onClose: () => void; onSave: (task: TaskDraft) => void }) {
  const [draft, setDraft] = useState<TaskDraft>({ ...initial, category: initial.category || 'Pessoal', date: initial.date || todayISO(), projectId: initial.projectId || projects[0]?.id || '', priority: initial.priority || { urgency: 'notUrgent', importance: 'important' } });
  const update = <K extends keyof TaskDraft,>(key: K, value: TaskDraft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.title?.trim() && draft.projectId && draft.category && draft.date && draft.priority?.urgency && draft.priority.importance) onSave(draft); };
  return <ModalShell title={initial.id ? 'Editar tarefa' : 'Nova tarefa'} subtitle="Escolha um próximo passo possível para hoje." onClose={onClose} onSubmit={submit}>
    <label className="field full"><span>Título da tarefa <b>*</b></span><input autoFocus required maxLength={140} placeholder="O que precisa ser feito?" value={draft.title || ''} onChange={e => update('title', e.target.value)} /></label>
    <div className="form-grid"><label className="field"><span>Projeto <b>*</b></span><select required value={draft.projectId || ''} onChange={e => update('projectId', e.target.value)}>{projects.length ? projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>) : <option value="">Crie um projeto primeiro</option>}</select></label><label className="field"><span>Categoria <b>*</b></span><select required value={draft.category || ''} onChange={e => update('category', e.target.value as Category)}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label></div>
    <div className="form-grid"><label className="field"><span>Data <b>*</b></span><input required type="date" value={draft.date || ''} onChange={e => update('date', e.target.value)} /></label><label className="field"><span>Horário <small>opcional</small></span><input type="time" value={draft.time || ''} onChange={e => update('time', e.target.value)} /></label></div>
    <label className="field full"><span>Pessoa relacionada <small>opcional</small></span><select value={draft.personId || ''} onChange={e => update('personId', e.target.value)}><option value="">Sem pessoa relacionada</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <div className="field full"><span>Prioridade <b>*</b></span><div className="priority-selectors"><label><small>Urgência</small><select value={draft.priority?.urgency || 'notUrgent'} onChange={e => update('priority', { ...draft.priority!, urgency: e.target.value as Priority['urgency'] })}><option value="urgent">Urgente</option><option value="notUrgent">Não urgente</option></select></label><label><small>Importância</small><select value={draft.priority?.importance || 'important'} onChange={e => update('priority', { ...draft.priority!, importance: e.target.value as Priority['importance'] })}><option value="important">Importante</option><option value="secondary">Secundário</option></select></label></div></div>
    <label className="complex-toggle"><span><span className="toggle-title">Tarefa complexa</span><small>Exige etapas sucessivas ou planejamento prévio.</small></span><input type="checkbox" checked={Boolean(draft.complex)} onChange={e => update('complex', e.target.checked)} /><i /></label>
  </ModalShell>;
}

function EventModal({ initial, people, onClose, onSave }: { initial: EventDraft; people: Person[]; onClose: () => void; onSave: (event: EventDraft) => void }) {
  const [draft, setDraft] = useState<EventDraft>({ ...initial, category: initial.category || 'Pessoal', date: initial.date || todayISO() });
  const update = <K extends keyof EventDraft,>(key: K, value: EventDraft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const submit = (e: FormEvent) => { e.preventDefault(); if (draft.title?.trim() && draft.category && draft.date && (draft.allDay || (draft.start && draft.end))) onSave(draft); };
  return <ModalShell title={initial.id ? 'Editar compromisso' : 'Novo compromisso'} subtitle="Um horário reservado com carinho." onClose={onClose} onSubmit={submit}>
    <label className="field full"><span>Título do compromisso <b>*</b></span><input autoFocus required maxLength={140} placeholder="Ex.: consulta, reunião, passeio..." value={draft.title || ''} onChange={e => update('title', e.target.value)} /></label>
    <div className="form-grid"><label className="field"><span>Categoria <b>*</b></span><select required value={draft.category || ''} onChange={e => update('category', e.target.value as Category)}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label><label className="field"><span>Data <b>*</b></span><input required type="date" value={draft.date || ''} onChange={e => update('date', e.target.value)} /></label></div>
    <label className="all-day-toggle"><input type="checkbox" checked={Boolean(draft.allDay)} onChange={e => update('allDay', e.target.checked)} /><span>Compromisso de dia inteiro</span></label>
    {!draft.allDay && <div className="form-grid"><label className="field"><span>Início <b>*</b></span><input required type="time" value={draft.start || ''} onChange={e => update('start', e.target.value)} /></label><label className="field"><span>Fim <b>*</b></span><input required type="time" value={draft.end || ''} onChange={e => update('end', e.target.value)} /></label></div>}
    <label className="field full"><span>Local <small>opcional</small></span><input placeholder="Endereço ou nome do local" value={draft.location || ''} onChange={e => update('location', e.target.value)} /></label>
    <label className="field full"><span>Pessoa relacionada <small>opcional</small></span><select value={draft.personId || ''} onChange={e => update('personId', e.target.value)}><option value="">Sem pessoa relacionada</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
  </ModalShell>;
}

function ProjectModal({ initial, onClose, onSave }: { initial: Partial<Project>; onClose: () => void; onSave: (project: Partial<Project>) => void }) {
  const [draft, setDraft] = useState<Partial<Project>>({ ...initial, name: initial.name || '', color: initial.color || COLORS[0], description: initial.description || '' });
  return <ModalShell title={initial.id ? 'Editar projeto' : 'Novo projeto'} subtitle="Um espaço para acompanhar um plano da família." onClose={onClose} onSubmit={e => { e.preventDefault(); if (draft.name?.trim()) onSave(draft); }}><label className="field full"><span>Nome do projeto <b>*</b></span><input autoFocus required maxLength={80} placeholder="Ex.: Viagem, casa, comemoração..." value={draft.name || ''} onChange={e => setDraft(old => ({ ...old, name: e.target.value }))} /></label><label className="field full"><span>Descrição <small>opcional</small></span><textarea rows={3} maxLength={240} placeholder="Uma breve descrição para lembrar o objetivo." value={draft.description || ''} onChange={e => setDraft(old => ({ ...old, description: e.target.value }))} /></label><div className="field full"><span>Cor do projeto</span><div className="color-options">{COLORS.map(color => <button type="button" key={color} aria-label={`Selecionar cor ${color}`} className={draft.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setDraft(old => ({ ...old, color }))}>{draft.color === color && <Check size={15} />}</button>)}</div></div></ModalShell>;
}

function PersonModal({ initial, onClose, onSave }: { initial: Partial<Person>; onClose: () => void; onSave: (person: Partial<Person>) => void }) {
  const [draft, setDraft] = useState<Partial<Person>>({ ...initial, name: initial.name || '', role: initial.role || 'Família', email: initial.email || '', color: initial.color || COLORS[2] });
  return <ModalShell title="Adicionar pessoa" subtitle="Inclua alguém importante para os combinados do dia a dia." onClose={onClose} onSubmit={e => { e.preventDefault(); if (draft.name?.trim()) onSave(draft); }}><label className="field full"><span>Nome <b>*</b></span><input autoFocus required maxLength={70} placeholder="Nome da pessoa" value={draft.name || ''} onChange={e => setDraft(old => ({ ...old, name: e.target.value }))} /></label><div className="form-grid"><label className="field"><span>Papel ou relação</span><input maxLength={60} placeholder="Ex.: Família, escola..." value={draft.role || ''} onChange={e => setDraft(old => ({ ...old, role: e.target.value }))} /></label><label className="field"><span>E-mail <small>opcional</small></span><input type="email" placeholder="nome@email.com" value={draft.email || ''} onChange={e => setDraft(old => ({ ...old, email: e.target.value }))} /></label></div><div className="field full"><span>Cor de identificação</span><div className="color-options">{COLORS.map(color => <button type="button" key={color} aria-label={`Selecionar cor ${color}`} className={draft.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setDraft(old => ({ ...old, color }))}>{draft.color === color && <Check size={15} />}</button>)}</div></div></ModalShell>;
}

export default App;
