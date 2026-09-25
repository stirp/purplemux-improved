import type { IAskUserQuestionItem, ITimelineAskUserQuestion, ITimelineEntry } from '@/types/timeline';

export const formatQuestionAnswers = (questions: IAskUserQuestionItem[], answers: string[]) =>
  questions.map((question, index) => `${question.question}\n${answers[index].trim()}`).join('\n\n');

const readAnswers = (questions: IAskUserQuestionItem[], text: string): string[] | null => {
  const answers: string[] = [];
  let remaining = text.trim();
  for (let index = 0; index < questions.length; index++) {
    const prefix = `${questions[index].question}\n`;
    if (!remaining.startsWith(prefix)) return null;
    remaining = remaining.slice(prefix.length);
    const next = questions[index + 1];
    const boundary = next ? remaining.indexOf(`\n\n${next.question}\n`) : remaining.length;
    if (boundary < 0) return null;
    const answer = remaining.slice(0, boundary).trim();
    if (!answer) return null;
    answers.push(answer);
    remaining = next ? remaining.slice(boundary + 2) : '';
  }
  return answers;
};

export const resolveAsyncQuestionAnswers = (entries: ITimelineEntry[]): ITimelineEntry[] => {
  const result = [...entries];
  const pending: { entry: ITimelineAskUserQuestion; index: number }[] = [];
  entries.forEach((entry, index) => {
    if (entry.type === 'ask-user-question' && entry.answerMode === 'compose' && entry.status === 'pending') {
      pending.push({ entry, index });
    } else if (entry.type === 'user-message' && !entry.pending) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const question = pending[i];
        const answers = readAnswers(question.entry.questions, entry.text);
        if (!answers) continue;
        result[question.index] = { ...question.entry, status: 'success', answers };
        pending.splice(i, 1);
        break;
      }
    }
  });
  return result;
};
