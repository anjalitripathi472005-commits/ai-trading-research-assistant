import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FilePenLine,
  FlaskConical,
  Gauge,
  Lightbulb,
  ListFilter,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  WandSparkles,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type Stage = 'ASK' | 'CLARIFY' | 'DEFINE';
type FieldKey = 'market' | 'timeframe' | 'entry' | 'exit' | 'holding' | 'filters' | 'question';
type Fields = Record<FieldKey, string | null>;

const queryClient = new QueryClient();

const emptyFields: Fields = {
  market: null,
  timeframe: null,
  entry: null,
  exit: null,
  holding: null,
  filters: null,
  question: null,
};

const fieldMeta: Record<FieldKey, { label: string; short: string; icon: typeof Target; prompt: string; suggestions: string[] }> = {
  market: {
    label: 'Market / instrument',
    short: 'Market',
    icon: BarChart3,
    prompt: 'Which market or instrument should this experiment look at?',
    suggestions: ['SPY — S&P 500 ETF', 'QQQ — Nasdaq 100 ETF', 'BTC — Bitcoin'],
  },
  timeframe: {
    label: 'Market timeframe',
    short: 'Timeframe',
    icon: Gauge,
    prompt: 'What candle or market timeframe should we use?',
    suggestions: ['Daily candles', 'Weekly candles', '4-hour candles'],
  },
  entry: {
    label: 'Entry condition',
    short: 'Enter when',
    icon: TrendingUp,
    prompt: 'What needs to happen before the experiment enters a position?',
    suggestions: ['20-day average crosses above 50-day average', 'Price breaks above its recent high', 'RSI moves below 30'],
  },
  exit: {
    label: 'Exit condition',
    short: 'Exit when',
    icon: ArrowRight,
    prompt: 'How should the experiment decide when to exit?',
    suggestions: ['After the holding period', 'When price closes below the 50-day average', 'At a 6% stop loss'],
  },
  holding: {
    label: 'Holding period',
    short: 'Hold for',
    icon: Timer,
    prompt: 'How long should each position be held at most?',
    suggestions: ['5 trading days', '10 trading days', '1 month'],
  },
  filters: {
    label: 'Filters & context',
    short: 'Only when',
    icon: ListFilter,
    prompt: 'Are there any conditions that should filter the experiment?',
    suggestions: ['Only in an upward weekly trend', 'Only when volume is above average', 'No additional filter'],
  },
  question: {
    label: 'Research question',
    short: 'The question',
    icon: CircleHelp,
    prompt: 'What are you trying to learn from this experiment?',
    suggestions: ['Does this setup improve consistency?', 'Is the entry more useful in a strong trend?', 'Does this work better than doing nothing?'],
  },
};

const orderedFields: FieldKey[] = ['market', 'timeframe', 'entry', 'exit', 'holding', 'filters', 'question'];

const examples = [
  {
    title: 'Moving average crossover',
    description: 'A classic, easy-to-understand starting point',
    text: 'Does buying SPY when its 20-day moving average crosses above its 50-day moving average, holding for 10 trading days, perform better in a weekly uptrend?',
  },
  {
    title: 'Breakout follow-through',
    description: 'Explore what happens after a new high',
    text: 'For QQQ on daily candles, if price breaks above its 20-day high, does holding for 5 trading days work better when volume is above average?',
  },
];

function parseQuestion(text: string): Fields {
  const lower = text.toLowerCase();
  const fields: Fields = { ...emptyFields, question: text.trim() || null };
  const marketMatch = text.match(/\b(SPY|QQQ|BTC|ETH|AAPL|NVDA|TSLA|S&P ?500|bitcoin|ethereum)\b/i);
  if (marketMatch) {
    const symbol = marketMatch[1].toUpperCase().replace(/\s+/g, ' ');
    fields.market = symbol === 'BITCOIN' ? 'BTC — Bitcoin' : symbol === 'ETHEREUM' ? 'ETH — Ethereum' : symbol === 'S&P 500' ? 'S&P 500' : `${symbol} — ${symbol === 'SPY' ? 'S&P 500 ETF' : symbol === 'QQQ' ? 'Nasdaq 100 ETF' : 'listed instrument'}`;
  }
  if (/\bweekly\b/i.test(text)) fields.timeframe = 'Weekly candles';
  else if (/\bdaily\b|\bday\b|\b20-day\b|\b50-day\b/i.test(text)) fields.timeframe = 'Daily candles';
  else if (/\b4[- ]?hour\b|\b4h\b/i.test(text)) fields.timeframe = '4-hour candles';
  if (/moving average|crosses above|crossover/i.test(lower)) fields.entry = '20-day average crosses above 50-day average';
  else if (/breaks? above|breakout|new high/i.test(lower)) fields.entry = 'Price breaks above its recent high';
  else if (/rsi/i.test(lower)) fields.entry = 'RSI moves below 30';
  else if (/buy(?:ing)?|enter/i.test(lower)) fields.entry = 'The stated buy condition occurs';
  if (/stop loss/i.test(lower)) fields.exit = 'At a 6% stop loss';
  else if (/closes below|exit when|sell when/i.test(lower)) fields.exit = 'When the stated exit condition occurs';
  else if (/hold(?:ing)? for|for \d+ (?:trading )?(?:day|week|month)/i.test(lower)) fields.exit = 'After the holding period';
  const holdingMatch = text.match(/(?:hold(?:ing)?|for)\s+(?:a\s+)?(\d+\s*(?:trading\s+)?(?:day|days|week|weeks|month|months|year|years))/i);
  if (holdingMatch) fields.holding = holdingMatch[1].replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  if (/weekly uptrend|upward weekly trend|strong trend|bullish/i.test(lower)) fields.filters = 'Only in an upward weekly trend';
  else if (/volume (?:is )?above average|above-average volume/i.test(lower)) fields.filters = 'Only when volume is above average';
  else if (/no (?:additional )?filter/i.test(lower)) fields.filters = 'No additional filter';
  if (!fields.question && text.trim()) fields.question = text.trim();
  return fields;
}

function AppButton({ children, className = '', onClick, disabled = false, type = 'button', testId }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; testId: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function StageRail({ stage, onStage }: { stage: Stage; onStage: (next: Stage) => void }) {
  const stages: Stage[] = ['ASK', 'CLARIFY', 'DEFINE'];
  return (
    <div className="flex items-center gap-2" data-testid="stage-navigation">
      {stages.map((item, index) => {
        const complete = stages.indexOf(stage) > index;
        const active = item === stage;
        return (
          <div className="flex items-center gap-2" key={item}>
            <button
              type="button"
              onClick={() => (complete || active) && onStage(item)}
              data-testid={`button-stage-${item.toLowerCase()}`}
              className={`group flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] transition-colors ${active ? 'text-[hsl(var(--foreground))]' : complete ? 'cursor-pointer text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition-all ${active ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]' : complete ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}>
                {complete ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className="hidden sm:block">{item}</span>
            </button>
            {index < stages.length - 1 && <span className="mx-1 h-px w-5 bg-[hsl(var(--border))] sm:w-10" />}
          </div>
        );
      })}
    </div>
  );
}

function AppShell() {
  const [stage, setStage] = useState<Stage>('ASK');
  const [question, setQuestion] = useState('');
  const [fields, setFields] = useState<Fields>({ ...emptyFields });
  const [isParsing, setIsParsing] = useState(false);
  const [clarifyIndex, setClarifyIndex] = useState(0);

  const missingFields = useMemo(() => orderedFields.filter((key) => !fields[key]), [fields]);
  const clarifyQueue = missingFields.length ? missingFields : orderedFields;
  const currentKey = clarifyQueue[Math.min(clarifyIndex, clarifyQueue.length - 1)] ?? 'market';
  const currentMeta = fieldMeta[currentKey];
  const completion = orderedFields.filter((key) => fields[key]).length;

  const reset = () => {
    setQuestion('');
    setFields({ ...emptyFields });
    setStage('ASK');
    setClarifyIndex(0);
    setIsParsing(false);
  };

  const runParse = (text: string) => {
    if (!text.trim() || isParsing) return;
    setIsParsing(true);
    window.setTimeout(() => {
      const parsed = parseQuestion(text);
      const nextMissing = orderedFields.filter((key) => !parsed[key]);
      setFields(parsed);
      setIsParsing(false);
      setClarifyIndex(0);
      setStage(nextMissing.length ? 'CLARIFY' : 'DEFINE');
    }, 520);
  };

  const chooseExample = (text: string) => {
    setQuestion(text);
    setFields(parseQuestion(text));
  };

  const answerClarification = (value: string) => {
    if (!value.trim()) return;
    const nextFields = { ...fields, [currentKey]: value.trim() };
    setFields(nextFields);
    const remainingMissing = orderedFields.filter((key) => !nextFields[key]);
    if (remainingMissing.length === 0) {
      if (missingFields.length === 0 && clarifyIndex < clarifyQueue.length - 1) {
        setClarifyIndex(clarifyIndex + 1);
      } else {
        setStage('DEFINE');
        setClarifyIndex(0);
      }
    } else {
      const nextKey = remainingMissing[0];
      const nextIndex = clarifyQueue.indexOf(nextKey);
      setClarifyIndex(nextIndex >= 0 ? nextIndex : 0);
    }
  };

  const editDefinition = () => {
    setClarifyIndex(0);
    setStage('CLARIFY');
  };

  return (
    <div className="grain min-h-[100dvh] bg-[hsl(var(--background))]">
      <header className="relative z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1420px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <button type="button" onClick={reset} data-testid="button-logo-reset" className="group flex items-center gap-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--sidebar))] text-[hsl(var(--accent))] transition-transform group-hover:-rotate-6">
              <FlaskConical size={18} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">Field Notes</span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] sm:block">Trading research assistant</span>
            </span>
          </button>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))] md:flex"><LockKeyhole size={12} /> Private by design</span>
            <AppButton onClick={reset} className="border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" testId="button-reset-top"><RotateCcw size={14} /> <span className="hidden sm:inline">Start over</span></AppButton>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1420px] gap-0 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-[hsl(var(--border))] px-5 py-7 sm:px-8 lg:min-h-[calc(100dvh-74px)] lg:border-b-0 lg:border-r lg:px-7 lg:py-10">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[hsl(var(--primary))]">A calmer way to</p>
              <h1 className="mt-2 font-serif text-3xl leading-[.95] tracking-[-0.04em] text-[hsl(var(--foreground))] lg:text-4xl">ask better<br /><em>questions.</em></h1>
            </div>
            <div className="hidden pt-16 lg:block">
              <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> The method</div>
              <div className="space-y-5 border-l border-[hsl(var(--border))] pl-4">
                <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]"><b className="text-[hsl(var(--foreground))]">01 / Ask plainly</b><br />Start with the idea in your own words.</p>
                <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]"><b className="text-[hsl(var(--foreground))]">02 / Make it precise</b><br />Fill in the pieces that matter.</p>
                <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]"><b className="text-[hsl(var(--foreground))]">03 / Define the test</b><br />Leave with something you can evaluate.</p>
              </div>
            </div>
            <div className="hidden text-right lg:block">
              <span className="font-mono text-3xl text-[hsl(var(--border))]">01—03</span>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-[10px] leading-relaxed text-[hsl(var(--muted-foreground))] lg:mt-24"><Sparkles size={13} className="shrink-0 text-[hsl(var(--chart-3))]" /> Research support, not investment advice.</div>
        </aside>

        <section className="min-w-0 px-5 py-7 sm:px-8 sm:py-10 lg:px-16 lg:py-12">
          <div className="mb-10 flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-7 sm:flex-row sm:items-center sm:justify-between">
            <StageRail stage={stage} onStage={setStage} />
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[hsl(var(--muted))] sm:w-28"><div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${Math.max(8, completion / orderedFields.length * 100)}%` }} /></div>
              <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{completion}/7 noted</span>
            </div>
          </div>

          {stage === 'ASK' && <AskStage question={question} setQuestion={setQuestion} onParse={runParse} isParsing={isParsing} onExample={chooseExample} />}
          {stage === 'CLARIFY' && <ClarifyStage currentKey={currentKey} meta={currentMeta} fields={fields} clarifyIndex={clarifyIndex} queueLength={clarifyQueue.length} onAnswer={answerClarification} onBack={() => setStage('ASK')} />}
          {stage === 'DEFINE' && <DefineStage fields={fields} onEdit={editDefinition} onReset={reset} />}
        </section>
      </main>
    </div>
  );
}

function AskStage({ question, setQuestion, onParse, isParsing, onExample }: { question: string; setQuestion: (value: string) => void; onParse: (value: string) => void; isParsing: boolean; onExample: (text: string) => void }) {
  return (
    <div className="animate-rise-in max-w-[980px]">
      <div className="max-w-3xl">
        <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--chart-3))]" /> Step one / start with the hunch</p>
        <h2 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-[hsl(var(--foreground))] sm:text-6xl">What are you <span className="font-serif font-normal italic text-[hsl(var(--primary))]">wondering</span> about the market?</h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">Say it like you would to a thoughtful friend. We’ll help turn the fuzzy idea into a small, testable experiment.</p>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); onParse(question); }} className="relative mt-10 max-w-4xl">
        <div className={`rounded-[1.4rem] border bg-[hsl(var(--card))] p-3 shadow-[var(--shadow-md)] transition-all ${question ? 'border-[hsl(var(--primary))]/60' : 'border-[hsl(var(--card-border))]'}`}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} data-testid="input-research-question" placeholder="For example, does buying after a pullback work better in a strong uptrend?" className="min-h-[156px] w-full resize-none border-0 bg-transparent px-4 py-3 text-lg leading-relaxed text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]/65 sm:px-6 sm:py-5 sm:text-xl" />
          <div className="flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-2 pt-3 sm:px-3">
            <span className="hidden text-[11px] text-[hsl(var(--muted-foreground))] sm:block">Plain language is perfect.</span>
            <AppButton type="submit" disabled={!question.trim() || isParsing} className="ml-auto bg-[hsl(var(--primary))] px-5 text-[hsl(var(--primary-foreground))] shadow-sm hover:-translate-y-0.5 hover:bg-[hsl(var(--primary))]/90" testId="button-parse-question">
              {isParsing ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground))]/40 border-t-[hsl(var(--primary-foreground))]" /> Listening…</> : <>Make it testable <ArrowRight size={15} /></>}
            </AppButton>
          </div>
        </div>
      </form>

      <div className="mt-11">
        <div className="mb-4 flex items-center gap-3"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Need a place to begin?</span><span className="h-px w-14 bg-[hsl(var(--border))]" /></div>
        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          {examples.map((example, index) => (
            <button key={example.title} type="button" onClick={() => onExample(example.text)} data-testid={`button-example-${index}`} className="group flex items-start gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--card))]">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Plus size={16} /></span>
              <span><span className="block text-sm font-semibold text-[hsl(var(--foreground))]">{example.title}</span><span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{example.description}</span></span>
              <ChevronRight size={15} className="ml-auto mt-1 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-12 flex max-w-4xl items-start gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/35 p-4 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]"><Lightbulb size={15} className="mt-0.5 shrink-0 text-[hsl(var(--chart-3))]" /><span><b className="text-[hsl(var(--foreground))]">A useful shift:</b> you don’t need a prediction to start. You only need a question you’re willing to test.</span></div>
    </div>
  );
}

function ClarifyStage({ currentKey, meta, fields, clarifyIndex, queueLength, onAnswer, onBack }: { currentKey: FieldKey; meta: typeof fieldMeta[FieldKey]; fields: Fields; clarifyIndex: number; queueLength: number; onAnswer: (value: string) => void; onBack: () => void }) {
  const Icon = meta.icon;
  const [custom, setCustom] = useState('');
  const answeredCount = orderedFields.filter((key) => fields[key]).length;
  return (
    <div className="animate-rise-in max-w-[980px]">
      <div className="mb-10 max-w-2xl">
        <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--primary))]"><WandSparkles size={13} /> Step two / sharpen the edges</p>
        <h2 className="text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-[hsl(var(--foreground))] sm:text-6xl">Let’s make the question <span className="font-serif font-normal italic text-[hsl(var(--primary))]">specific.</span></h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">A good experiment has a few clear knobs. We’ll take them one at a time — no jargon quiz required.</p>
      </div>

      <div className="max-w-3xl rounded-[1.4rem] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-md)] sm:p-8">
        <div className="mb-9 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">One detail at a time</span>
          <span className="font-mono text-[10px] text-[hsl(var(--primary))]">{Math.min(clarifyIndex + 1, queueLength)} / {queueLength}</span>
        </div>
        <div className="mb-8 h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500" style={{ width: `${Math.max(12, (answeredCount / orderedFields.length) * 100)}%` }} /></div>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon size={22} strokeWidth={1.8} /></span>
          <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{meta.label}</p><h3 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[hsl(var(--foreground))]">{meta.prompt}</h3></div>
        </div>
        <div className="mt-8 grid gap-2">
          {meta.suggestions.map((suggestion, index) => (
            <button key={suggestion} type="button" onClick={() => onAnswer(suggestion)} data-testid={`button-suggestion-${currentKey}-${index}`} className="group flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 px-4 py-3.5 text-left text-sm font-medium text-[hsl(var(--foreground))] transition-all hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))]">
              <span>{suggestion}</span><ArrowRight size={15} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" />
            </button>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <input value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAnswer(custom); setCustom(''); } }} data-testid={`input-custom-${currentKey}`} placeholder="Or write your own…" className="min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-transparent px-4 py-3 text-sm outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]" />
          <AppButton onClick={() => { onAnswer(custom); setCustom(''); }} disabled={!custom.trim()} className="bg-[hsl(var(--sidebar))] px-4 text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--primary))]" testId={`button-submit-custom-${currentKey}`}><Check size={15} /> <span className="hidden sm:inline">Use this</span></AppButton>
        </div>
      </div>
      <div className="mt-7 flex max-w-3xl items-center justify-between">
        <AppButton onClick={onBack} className="px-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" testId="button-back-to-ask"><ArrowLeft size={15} /> Back to question</AppButton>
        <span className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex"><CircleHelp size={14} /> You can revise this later</span>
      </div>
    </div>
  );
}

function DefineStage({ fields, onEdit, onReset }: { fields: Fields; onEdit: () => void; onReset: () => void }) {
  const complete = orderedFields.every((key) => fields[key]);
  return (
    <div className="animate-rise-in max-w-[1020px]">
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-4 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--primary))]"><Target size={13} /> Step three / your experiment</p>
          <h2 className="text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-[hsl(var(--foreground))] sm:text-6xl">A question you can <span className="font-serif font-normal italic text-[hsl(var(--primary))]">work with.</span></h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">Here’s the experiment definition we heard. It’s a starting point, not a signal or a promise.</p>
        </div>
        <div className="flex gap-2 sm:pb-1"><AppButton onClick={onEdit} className="border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" testId="button-edit-definition"><Pencil size={14} /> Edit</AppButton><AppButton onClick={onReset} className="text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" testId="button-reset-definition"><RotateCcw size={14} /> Start over</AppButton></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-[1.4rem] border border-[hsl(var(--sidebar))] bg-[hsl(var(--sidebar))] p-5 text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-lg)] sm:p-8">
          <div className="mb-7 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground))]/60">Experiment definition</span><span className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--accent))] px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--accent-foreground))]"><CheckCircle2 size={11} /> {complete ? 'Ready to test' : 'Needs one detail'}</span></div>
          <div className="mb-8 border-b border-[hsl(var(--sidebar-border))] pb-7"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--sidebar-foreground))]/55">Research question</p><p data-testid="text-defined-question" className="mt-3 max-w-2xl font-serif text-3xl leading-[1.08] text-[hsl(var(--sidebar-foreground))] sm:text-4xl">“{fields.question || 'What would you like to learn?'}”</p></div>
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {orderedFields.filter((key) => key !== 'question').map((key) => {
              const meta = fieldMeta[key];
              const Icon = meta.icon;
              return <div key={key} data-testid={`definition-field-${key}`}><div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[hsl(var(--sidebar-foreground))]/55"><Icon size={12} /> {meta.short}</div><p className="mt-2 text-sm leading-snug text-[hsl(var(--sidebar-foreground))]">{fields[key] || <span className="italic text-[hsl(var(--sidebar-foreground))]/50">Not specified yet</span>}</p></div>;
            })}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-[1.4rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"><div className="mb-5 flex items-center gap-2 text-[hsl(var(--primary))]"><FilePenLine size={17} /><span className="font-mono text-[10px] uppercase tracking-[0.17em]">What this gives you</span></div><ul className="space-y-4 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]"><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--accent-foreground))]" />A shared language for your market idea.</li><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--accent-foreground))]" />A fairer way to compare outcomes.</li><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--accent-foreground))]" />A record you can revisit and improve.</li></ul></div>
          <div className="flex flex-1 flex-col justify-between rounded-[1.4rem] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/45 p-6"><div><div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><BarChart3 size={17} /></div><p className="text-sm font-semibold text-[hsl(var(--foreground))]">The next step is yours.</p><p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Field Notes stops at the research plan. Use your own tools and judgment to evaluate it — this assistant does not place trades or provide investment advice.</p></div><AppButton onClick={onReset} className="mt-7 w-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]" testId="button-new-experiment">Create another question <Plus size={15} /></AppButton></div>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={AppShell} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
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