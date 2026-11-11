/** One conversation about one book. `title` is empty until the first exchange is stored. */
export interface AgentSession {
  id: string; bookId: string; chapter: number; chapterLabel: string; title: string;
  anchorPara: number; anchorSentence: number; updatedAt: number;
}

/** `quote` on a user message is the sentence that was selected when the question was asked; `cite` is the agent's 出处. */
export type AgentMessage =
  | { role: 'user'; text: string; quote?: string; at: number }
  | { role: 'agent'; text: string; cite?: string; at: number };

/** Where a question was asked: the picked sentence, or the reader's anchor for a 问旁注 selection (M13, Z-12). */
export interface AgentLoc { chapter: number; para: number; sentence: number }

/** A row of the 对话 list on Home's 札记 page: every book, newest first (Z-11). */
export interface SessionListItem extends AgentSession {
  bookTitle: string;
  /** The first question's quote (the sentence or the selection it was about). */
  quote: string;
}
