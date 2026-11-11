import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { HomeScreen } from '../_stories/Phone.tsx';
import { NotesLineView } from './NotesLine.tsx';

/**
 * Home → 札记 line (M13, Z-09): one quiet line under the continue block, shown once the reader has
 * talked to 旁注. No number anywhere but a date; the right side is › or one action word in the accent.
 * The toolbar's 纸白 / 夜读 switch shows both themes.
 */
const meta = {
  title: 'Home/札记 NotesLine',
  component: NotesLineView,
  args: { act: '›', onTap: fn() },
  render: (args) => <HomeScreen><NotesLineView {...args} /></HomeScreen>,
} satisfies Meta<typeof NotesLineView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1 · A run is in progress. */
export const Running: Story = { args: { l1: '正在整理昨天的对话…', act: null } };
/** 2 · An unread entry: its day and book, and its first 要点. */
export const Unread: Story = { args: { l1: '昨天 · The Great Gatsby', l2: 'vulnerable 在这里是「涉世未深」，不是脆弱', act: '›' } };
/** 3 · A closed day not yet summarised (自动整理 not on, or its last run failed). */
export const ClosedDayPending: Story = { args: { l1: '昨天的对话还没整理', l2: '把问过的问题整理成几条札记', act: '整理' } };
/** 4 · Only today pending, back from the reader. */
export const TodayPending: Story = { args: { l1: '今天的对话', l2: '读完了？整理成札记', act: '整理' } };
/** 5 · Otherwise. */
export const Idle: Story = { args: { act: '›' } };
/** A tapped run that failed: the reason for this Home appearance, and 重试. */
export const FailedManual: Story = { args: { l1: '昨天的对话还没整理', l2: '网络连接失败', act: '重试' } };
