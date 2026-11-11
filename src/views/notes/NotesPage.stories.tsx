import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { Session } from '../../app/boot.ts';
import { setKey } from '../../core/ai/key.ts';
import type { Db } from '../../core/db/types.ts';
import { dayKey } from '../../core/notes/day.ts';
import { NotesService } from '../../core/notes/service.ts';
import { listEntries, setAuto } from '../../core/notes/store.ts';
import type { RunState } from '../../core/notes/types.ts';
import { PrefsStore } from '../../core/prefs/prefs.ts';
import { EXCHANGES, NOTES, seedNotes, shelfDb } from '../_stories/fixtures.ts';
import { Phone } from '../_stories/Phone.tsx';
import { listAllSessions } from '../../core/agent/store.ts';
import { Conversations } from './Conversations.tsx';
import { NoteCard } from './NoteCard.tsx';
import { NotesPage } from './NotesPage.tsx';

/**
 * 札记 page (M13, docs/plans/2026-11-11-zhaji.md §3.4): a layer over Home with 札记 (a journal, newest
 * day first, one block per book) and 对话 (every conversation of every book; swipe left to delete).
 * No DeepSeek here: entries are written into the db as the app stores them; run states are fixed.
 */
const meta = {
  title: 'Home/札记 NotesPage',
  render: (_args, { loaded }) => (
    <Phone bg="var(--home-bg)">
      <div className="home">
        <NotesPage session={loaded.session as Session} onClose={fn()} onOpenConversation={fn()} {...(loaded.view ? { initialView: loaded.view as 'conversations' } : {})} />
      </div>
    </Phone>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A NotesService that never calls DeepSeek and shows a fixed run state. */
class FixedNotes extends NotesService {
  #fixed: RunState;
  constructor(db: Db, state: RunState) { super(db); this.#fixed = state; }
  override get state(): RunState { return this.#fixed; }
  override run(): Promise<RunState> { return Promise.resolve(this.#fixed); }
  override runAuto(): Promise<RunState> { return Promise.resolve(this.#fixed); }
}

async function session(opts: { notes?: boolean; key?: boolean; auto?: 'on' | 'off' | null; state?: RunState; conversations?: boolean } = {}): Promise<{ session: Session }> {
  const db = await shelfDb();
  if (opts.conversations !== false) await seedNotes(db, { notes: opts.notes ?? true });
  if (opts.key ?? true) await setKey(db, 'sk-story-0000');
  const auto = opts.auto === undefined ? 'on' : opts.auto;
  if (auto) await setAuto(db, auto);
  return { session: { db, prefs: await PrefsStore.load(db), notes: new FixedNotes(db, opts.state ?? { status: 'idle' }) } };
}

const yesterday = () => dayKey(Date.now() - 86_400_000);

/** The journal: two days, two books, with the 自动整理 switch at the end. */
export const Journal: Story = { loaders: [() => session()] };
/** Conversations exist but no 札记 yet, key saved: one sentence and 整理. */
export const NoEntries: Story = { loaders: [() => session({ notes: false, auto: null })] };
/** No key yet: the same sentence, then the key card. */
export const NoKey: Story = { loaders: [() => session({ notes: false, key: false, auto: null })] };
/** A run in progress on yesterday's Gatsby. */
export const Generating: Story = { loaders: [() => session({ notes: false, auto: null, state: { status: 'running', day: yesterday(), bookId: 'gatsby', auto: false } })] };
/** A tapped run that failed: the reason and 重试. */
export const Failed: Story = { loaders: [() => session({ notes: false, auto: null, state: { status: 'error', reason: 'network', auto: false, day: yesterday(), bookId: 'gatsby' } })] };
/** Nothing at all: every conversation was deleted. */
export const Empty: Story = { loaders: [() => session({ conversations: false, notes: false, auto: null })] };

/** One note with its exchange expanded, and one swiped open to 删除. */
export const NoteStates: Story = {
  loaders: [async () => {
    const { session: s } = await session();
    const items = (await listEntries(s.db)).flatMap((e) => e.items);
    return { session: s, items };
  }],
  render: (_args, { loaded }) => {
    const s = loaded.session as Session;
    const [a, b] = loaded.items as Awaited<ReturnType<typeof listEntries>>[number]['items'];
    const x = EXCHANGES[NOTES[0].ex];
    return (
      <Phone bg="var(--home-bg)">
        <div className="notes" style={{ position: 'absolute' }}>
          <div className="notes-view">
            {a && <NoteCard db={s.db} item={a} open={false} onSwipe={fn()} onDelete={fn()} initialExchange={{ question: x.question, answer: x.answer, cite: x.cite }} />}
            {b && <NoteCard db={s.db} item={b} open onSwipe={fn()} onDelete={fn()} />}
          </div>
        </div>
      </Phone>
    );
  },
};

/** 对话: every book's conversations, newest first, each led by its quoted sentence. */
export const ConversationList: Story = { loaders: [async () => ({ ...(await session()), view: 'conversations' })] };
/** 对话 with nothing in it. */
export const ConversationsEmpty: Story = { loaders: [async () => ({ ...(await session({ conversations: false, auto: null })), view: 'conversations' })] };
/** A conversation row swiped left to reveal 删除. */
export const ConversationSwiped: Story = {
  loaders: [async () => { const { session: s } = await session(); return { items: await listAllSessions(s.db) }; }],
  render: (_args, { loaded }) => {
    const items = loaded.items as Awaited<ReturnType<typeof listAllSessions>>;
    return (
      <Phone bg="var(--home-bg)">
        <div className="notes" style={{ position: 'absolute' }}>
          <div className="notes-view">
            <Conversations items={items} swiped={items[0]?.id ?? null} onSwipe={fn()} onOpen={fn()} onDelete={fn()} />
          </div>
        </div>
      </Phone>
    );
  },
};
