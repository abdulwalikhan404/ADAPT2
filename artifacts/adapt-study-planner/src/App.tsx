import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useGenerateStudyPlan,
  useRepairStudyPlan,
  type StudyPlanInput,
  type StudyPlanResult,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlarmClock,
  BookOpen,
  Check,
  Clock3,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { StudyTask, StudyPlan } from '@/lib/scheduler';
import {
  buildEnginePlanInput,
  getAvailableMinutes,
  toPlannerView,
} from '@/lib/engine-adapter';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const STORAGE_KEY = 'adapt-study-tasks-v1';
const STARTING_CAPACITY = 240;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

const examples: StudyTask[] = [
  {
    id: 'example-biology',
    title: 'Review cell biology notes',
    durationMinutes: 45,
    priority: 4,
    deadline: plusDays(1),
    canSplit: true,
  },
  {
    id: 'example-statistics',
    title: 'Statistics problem set',
    durationMinutes: 60,
    priority: 5,
    deadline: plusDays(2),
    canSplit: false,
  },
  {
    id: 'example-reading',
    title: 'Read chapter 6',
    durationMinutes: 30,
    priority: 2,
    deadline: plusDays(3),
    canSplit: true,
  },
];

function readTasks(): StudyTask[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed as StudyTask[];
    }
  } catch {
    // A fresh example list is more helpful than a broken local save.
  }
  return examples;
}

function formatClock(minute: number) {
  const date = new Date();
  date.setHours(0, minute, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatDeadline(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function requestErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : 'Could not contact the native ADAPT engine.';
  return /demo (scheduler|plan).*not used/i.test(message)
    ? message
    : `${message} No demo scheduling result was substituted.`;
}

function Home() {
  const [tasks, setTasks] = useState<StudyTask[]>(readTasks);
  const [capacity, setCapacity] = useState(STARTING_CAPACITY);
  const [lostMinutes, setLostMinutes] = useState(0);
  const [planReady, setPlanReady] = useState(false);
  const [generationVersion, setGenerationVersion] = useState(0);
  const [engineResult, setEngineResult] = useState<StudyPlanResult | null>(null);
  const [baselineResult, setBaselineResult] = useState<StudyPlanResult | null>(null);
  const [planError, setPlanError] = useState('');
  const [planPending, setPlanPending] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('45');
  const [priority, setPriority] = useState('3');
  const [deadline, setDeadline] = useState(plusDays(2));
  const [canSplit, setCanSplit] = useState(true);
  const [validation, setValidation] = useState('');
  const requestSequence = useRef(0);
  const generateMutation = useGenerateStudyPlan();
  const repairMutation = useRepairStudyPlan();
  const baseAvailableMinutes = baselineResult ? getAvailableMinutes(baselineResult) : 0;
  const availableMinutes = Math.max(0, baseAvailableMinutes - lostMinutes);
  const plan: StudyPlan | null = useMemo(
    () => engineResult ? toPlannerView(engineResult, availableMinutes) : null,
    [engineResult, availableMinutes],
  );

  useEffect(() => {
    if (!planReady) return;

    const requestId = ++requestSequence.current;
    setLostMinutes(0);
    setEngineResult(null);
    setBaselineResult(null);
    setPlanError('');
    setPlanPending(false);

    if (tasks.length === 0) return;

    let input: StudyPlanInput;
    try {
      input = buildEnginePlanInput(tasks, capacity, new Date());
    } catch (error) {
      setPlanError(requestErrorMessage(error));
      return;
    }

    setPlanPending(true);
    void generateMutation.mutateAsync({ data: input })
      .then((result) => {
        if (requestSequence.current !== requestId) return;
        setEngineResult(result);
        setBaselineResult(result);
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        setPlanError(requestErrorMessage(error));
      })
      .finally(() => {
        if (requestSequence.current === requestId) setPlanPending(false);
      });

    return () => {
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [tasks, capacity, planReady, generationVersion, generateMutation.mutateAsync]);

  function persist(nextTasks: StudyTask[]) {
    setTasks(nextTasks);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks));
    } catch {
      setValidation('Your browser could not save this list. Your tasks are still available for this visit.');
    }
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const minutes = Number(duration);
    const rank = Number(priority);
    if (!cleanTitle) {
      setValidation('Add a short name for this study commitment.');
      return;
    }
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
      setValidation('Choose a duration between 5 minutes and 12 hours.');
      return;
    }
    if (!deadline) {
      setValidation('Choose the date this commitment is due.');
      return;
    }
    const next: StudyTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: cleanTitle,
      durationMinutes: minutes,
      priority: rank,
      deadline,
      canSplit,
    };
    persist([...tasks, next]);
    setTitle('');
    setDuration('45');
    setPriority('3');
    setDeadline(plusDays(2));
    setCanSplit(true);
    setValidation('');
  }

  function removeTask(id: string) {
    persist(tasks.filter((task) => task.id !== id));
    setValidation('');
  }

  function removeExamples() {
    persist(tasks.filter((task) => !task.id.startsWith('example-')));
    setValidation('');
  }

  function generatePlan() {
    setPlanReady(true);
    setGenerationVersion((current) => current + 1);
  }

  async function simulateLostTime() {
    if (!engineResult || !baselineResult || planPending) return;
    const originalWindow = baselineResult.world.availability[0];
    if (!originalWindow) {
      setPlanError('There is no available study window to shorten.');
      return;
    }

    const loss = Math.min(30, originalWindow.endMinute - originalWindow.startMinute);
    if (loss <= 0) return;

    const requestId = ++requestSequence.current;
    setPlanPending(true);
    setPlanError('');
    try {
      const result = await repairMutation.mutateAsync({
        data: {
          world: engineResult.world,
          plan: engineResult.plan,
          disruption: {
            type: 'LostWindow',
            interval: {
              startMinute: originalWindow.endMinute - loss,
              endMinute: originalWindow.endMinute,
            },
          },
        },
      });
      if (requestSequence.current === requestId) {
        setEngineResult(result);
        setLostMinutes(loss);
      }
    } catch (error) {
      if (requestSequence.current === requestId) setPlanError(requestErrorMessage(error));
    } finally {
      if (requestSequence.current === requestId) setPlanPending(false);
    }
  }

  function resetLostTime() {
    requestSequence.current += 1;
    setLostMinutes(0);
    setEngineResult(baselineResult);
    setPlanError('');
    setPlanPending(false);
  }

  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const exampleCount = tasks.filter((task) => task.id.startsWith('example-')).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ADAPT 2.0 home" data-testid="link-home">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={18} strokeWidth={1.8} /></span>
          <span><span className="brand-name">ADAPT <span style={{ color: '#c57759' }}>2.0</span></span><span className="brand-sub">STUDY, AT YOUR PACE</span></span>
        </a>
        <div className="top-note"><span aria-hidden="true">•</span> A little structure, a little breathing room</div>
      </header>

      <main className="page-wrap">
        <section className="intro fade-in" aria-labelledby="page-title">
          <div>
            <div className="eyebrow">Your study space</div>
            <h1 id="page-title">ADAPT 2.0</h1>
            <p className="product-subtitle">Adaptive Daily Academic Planning Tool</p>
            <p>Gather your study commitments, then shape a plan that fits the time you actually have today.</p>
          </div>
          <div className="today-stamp" data-testid="text-today"><Clock3 size={14} style={{ verticalAlign: '-3px', marginRight: 7 }} />{today}</div>
        </section>

        <div className="workspace">
          <section className="panel fade-in" aria-labelledby="commitments-title">
            <div className="panel-head">
              <div>
                <h2 className="panel-title" id="commitments-title">Your commitments</h2>
                <p className="panel-subtitle">Start with what needs your attention.</p>
              </div>
              <span className="count-pill" data-testid="text-task-count">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
            </div>

            <form className="task-form" onSubmit={addTask} noValidate>
              <label className="field-label" htmlFor="task-title">What would you like to study?</label>
              <input id="task-title" className="text-field" type="text" maxLength={100} placeholder="e.g. Prepare for biology quiz" value={title} onChange={(event) => setTitle(event.target.value)} aria-describedby="form-validation" data-testid="input-task-title" />
              <div className="form-grid">
                <div>
                  <label className="field-label" htmlFor="task-duration">Study time</label>
                  <div style={{ position: 'relative' }}>
                    <input id="task-duration" className="text-field" type="number" min="5" max="720" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} data-testid="input-task-duration" />
                  </div>
                  <div className="field-hint">Minutes, between 5 and 720</div>
                </div>
                <div>
                  <label className="field-label" htmlFor="task-priority">Importance</label>
                  <select id="task-priority" className="select-field" value={priority} onChange={(event) => setPriority(event.target.value)} data-testid="select-task-priority">
                    <option value="1">1 · Whenever</option>
                    <option value="2">2 · Low</option>
                    <option value="3">3 · Usual</option>
                    <option value="4">4 · Important</option>
                    <option value="5">5 · Top priority</option>
                  </select>
                </div>
                <div className="wide">
                  <label className="field-label" htmlFor="task-deadline">Due by</label>
                  <input id="task-deadline" className="text-field" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} data-testid="input-task-deadline" />
                </div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={canSplit} onChange={(event) => setCanSplit(event.target.checked)} data-testid="checkbox-task-splittable" />
                This task can be split into shorter sessions
              </label>
              <div id="form-validation" className="validation" role="status" aria-live="polite" data-testid="status-task-validation">{validation}</div>
              <div className="form-actions">
                <span className="field-hint">You can adjust this list any time.</span>
                <button className="button button-primary" type="submit" data-testid="button-add-task"><Plus size={15} /> Add task</button>
              </div>
            </form>

            <div className="task-list" aria-label="Study commitments">
              {tasks.length === 0 ? (
                <div className="empty-tasks" data-testid="empty-task-list">Your list is clear. Add one commitment above to begin.</div>
              ) : tasks.map((task) => (
                <article className="task-row" key={task.id} data-testid={`row-task-${task.id}`}>
                  <div>
                    <div className="task-title" data-testid={`text-task-title-${task.id}`}>
                      {task.title}
                      {task.id.startsWith('example-') && <span className="demo-tag">example</span>}
                    </div>
                    <div className="task-meta" data-testid={`text-task-details-${task.id}`}>
                      <span>{formatDuration(task.durationMinutes)}</span>
                      <span>Due {formatDeadline(task.deadline)}</span>
                      <span className="priority-mark"><Sparkles size={11} /> Priority {task.priority}</span>
                      {task.canSplit && <span>Flexible sessions</span>}
                    </div>
                  </div>
                  <button className="icon-button" type="button" aria-label={`Remove ${task.title}`} title={`Remove ${task.title}`} onClick={() => removeTask(task.id)} data-testid={`button-remove-task-${task.id}`}><Trash2 size={15} /></button>
                </article>
              ))}
            </div>
            {exampleCount > 0 && (
              <div style={{ padding: '0 24px 18px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="button button-secondary" type="button" onClick={removeExamples} data-testid="button-remove-examples" style={{ padding: '8px 10px', fontSize: 10 }}>Remove example tasks</button>
              </div>
            )}

            <section className="capacity-box" aria-labelledby="capacity-title">
              <div className="capacity-top">
                <div>
                  <div className="capacity-title" id="capacity-title">Time available today</div>
                  <div className="capacity-note">The engine treats this as one continuous study window; include break time here.</div>
                </div>
                <label>
                  <span className="sr-only">Available study minutes today</span>
                  <input className="capacity-input" type="number" min="0" max="720" step="15" value={capacity} onChange={(event) => setCapacity(Math.min(720, Math.max(0, Number(event.target.value) || 0)))} data-testid="input-available-minutes" />
                  <span className="capacity-value"> min</span>
                </label>
              </div>
              <input className="capacity-slider" aria-label="Adjust available study time" type="range" min="0" max="720" step="15" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} data-testid="slider-available-minutes" />
              {lostMinutes > 0 && <div className="capacity-note" data-testid="text-remaining-capacity">After lost time: {formatDuration(availableMinutes)} remains.</div>}
            </section>
          </section>

          <section className="panel plan-panel fade-in" aria-labelledby="plan-title">
            <div className="plan-header">
              <div className="plan-kicker">A plan that can flex</div>
              <h2 id="plan-title">Today, thoughtfully.</h2>
              <p>A gentle outline from your commitments and the time you have. Nothing here is set in stone.</p>
              <p className="demo-disclaimer">C++17 ADAPT engine · Scheduling runs on the server</p>
              {planPending && <p className="engine-status" role="status" aria-live="polite">Working with the C++ ADAPT engine…</p>}
              {planError && <p className="engine-error" role="alert" data-testid="status-plan-error">{planError}</p>}
              {plan && (
                <div className="plan-stats" aria-label="Plan summary">
                  <div className="plan-stat"><strong data-testid="text-scheduled-time">{formatDuration(plan.scheduledMinutes)}</strong><span>planned study</span></div>
                  <div className="plan-stat"><strong data-testid="text-session-count">{plan.sessions.length}</strong><span>{plan.sessions.length === 1 ? 'session' : 'sessions'}</span></div>
                  <div className="plan-stat"><strong data-testid="text-plan-capacity">{formatDuration(plan.availableMinutes)}</strong><span>available today</span></div>
                </div>
              )}
            </div>
            <div className="generate-row">
              <p>{planReady ? 'Changes to your tasks or available time update this outline.' : 'When your list feels ready, we’ll lay it out here.'}</p>
              <button className="button button-primary" type="button" onClick={generatePlan} disabled={tasks.length === 0 || planPending} data-testid="button-generate-plan"><Sparkles size={14} /> {planPending ? 'Building…' : planReady ? 'Refresh plan' : 'Make my plan'}</button>
            </div>

            {!planReady ? (
              <div className="plan-empty" data-testid="empty-study-plan">
                <div className="empty-icon"><AlarmClock size={19} /></div>
                <strong>Your day, with a little more shape</strong>
                <p>Add the things on your mind, then make a plan. You can change it whenever your day does.</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="plan-empty" data-testid="empty-study-plan">
                <div className="empty-icon"><Check size={19} /></div>
                <strong>A clear day is a good plan, too.</strong>
                <p>Add a study commitment whenever you’re ready to make room for one.</p>
              </div>
            ) : planError && !plan ? (
              <div className="plan-empty" data-testid="empty-study-plan">
                <div className="empty-icon"><Clock3 size={19} /></div>
                <strong>Your plan could not be generated</strong>
                <p>The planner will show results only from the real C++ engine. Correct the issue or retry; no demo plan was substituted.</p>
              </div>
            ) : planPending && !plan ? (
              <div className="plan-empty" data-testid="empty-study-plan">
                <div className="empty-icon"><Clock3 size={19} /></div>
                <strong>Preparing your study plan</strong>
                <p>Your commitments are being sent to the server-side C++ engine.</p>
              </div>
            ) : plan && plan.sessions.length === 0 ? (
              <div className="plan-empty" data-testid="empty-study-plan">
                <div className="empty-icon"><Clock3 size={19} /></div>
                <strong>No study time set aside just yet</strong>
                <p>Adjust today’s available time to give your commitments a place in the plan.</p>
              </div>
            ) : plan && (
              <div className="schedule" aria-label="Today's study schedule" data-testid="list-study-sessions">
                {plan.sessions.map((session) => (
                  <article className="schedule-item" key={session.id} data-testid={`row-session-${session.id}`}>
                    <div className="schedule-time">
                      <time>{formatClock(session.startMinute)}</time><br />
                      <time>{formatClock(session.endMinute)}</time>
                    </div>
                    <span className="schedule-dot" aria-hidden="true" />
                    <div className="schedule-info">
                      <h3>{session.title}{session.totalParts > 1 && <span className="part-label">Part {session.part} of {session.totalParts}</span>}</h3>
                      <p>{formatDuration(session.durationMinutes)} of focused study</p>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {plan && plan.unscheduled.length > 0 && (
              <section className="unscheduled" aria-labelledby="unscheduled-title" data-testid="list-unscheduled-tasks">
                <h3 id="unscheduled-title">Still waiting for a little more time</h3>
                {plan.unscheduled.map((item) => (
                  <div className="unscheduled-row" key={item.taskId} data-testid={`row-unscheduled-${item.taskId}`}>
                    <span>{item.title} · {formatDuration(item.remainingMinutes)} left</span>
                    <span>{item.reason}</span>
                  </div>
                ))}
              </section>
            )}

            {planReady && tasks.length > 0 && (
              <section className="lost-time" aria-label="Adjust for a change in your day">
                <div className="lost-time-copy">
                  <strong>Plans change. Give yourself some room.</strong>
                  <span>{lostMinutes ? `${formatDuration(lostMinutes)} accounted for` : 'See how the plan shifts if you lose a little time.'}</span>
                </div>
                {lostMinutes > 0 ? (
                  <button className="button button-secondary" type="button" onClick={resetLostTime} data-testid="button-reset-lost-time"><RotateCcw size={13} /> Reset</button>
                ) : (
                  <button className="button button-secondary" type="button" onClick={simulateLostTime} disabled={planPending || !engineResult || Math.min(30, baseAvailableMinutes) === 0} data-testid="button-simulate-lost-time"><Clock3 size={13} /> Lost {Math.min(30, baseAvailableMinutes)} min</button>
                )}
              </section>
            )}
          </section>
        </div>
        <p className="footnote">Study plans are generated by the original C++17 ADAPT engine on the server.</p>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
