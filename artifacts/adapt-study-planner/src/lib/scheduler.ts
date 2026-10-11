export type StudyTask = {
  id: string;
  title: string;
  durationMinutes: number;
  priority: number;
  deadline: string;
  canSplit: boolean;
};

export type StudySession = {
  id: string;
  taskId: string;
  title: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  part: number;
  totalParts: number;
};

export type UnscheduledTask = {
  taskId: string;
  title: string;
  remainingMinutes: number;
  reason: string;
};

export type StudyPlan = {
  sessions: StudySession[];
  unscheduled: UnscheduledTask[];
  scheduledMinutes: number;
  availableMinutes: number;
};

const SESSION_LENGTH = 30;
const BREAK_LENGTH = 5;
const MINUTES_PER_DAY = 24 * 60;

function deadlineTimestamp(value: string): number {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      23,
      59,
      59,
      999,
    );
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    ) {
      return Number.NaN;
    }
    return date.getTime();
  }
  return Date.parse(value);
}

/**
 * Simple, local-only demo scheduling logic. Tasks are ordered by deadline,
 * then priority. Split-enabled tasks are placed in blocks of up to 30 minutes.
 * This does not call or represent the C++ ADAPT engine.
 */
export function generateStudyPlan(
  tasks: StudyTask[],
  availableMinutes: number,
  now: Date,
): StudyPlan {
  const budget = Number.isFinite(availableMinutes)
    ? Math.max(0, Math.floor(availableMinutes))
    : 0;
  const current = Number.isNaN(now.getTime()) ? new Date() : now;
  const start = Math.min(
    MINUTES_PER_DAY - 1,
    Math.ceil((current.getHours() * 60 + current.getMinutes()) / 5) * 5,
  );
  const endOfDay = MINUTES_PER_DAY - 1;
  const orderedTasks = [...tasks].sort((a, b) => {
    const aDeadline = deadlineTimestamp(a.deadline);
    const bDeadline = deadlineTimestamp(b.deadline);
    const validA = Number.isNaN(aDeadline) ? Number.POSITIVE_INFINITY : aDeadline;
    const validB = Number.isNaN(bDeadline) ? Number.POSITIVE_INFINITY : bDeadline;

    return (
      validA - validB ||
      b.priority - a.priority ||
      a.title.localeCompare(b.title)
    );
  });

  const sessions: StudySession[] = [];
  const unscheduled: UnscheduledTask[] = [];
  let cursor = start;
  let remainingBudget = budget;
  let scheduledMinutes = 0;

  for (const task of orderedTasks) {
    const duration = Math.floor(task.durationMinutes);
    const deadlineMs = deadlineTimestamp(task.deadline);

    if (!Number.isFinite(duration) || duration <= 0) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        remainingMinutes: Math.max(0, duration || 0),
        reason: "Duration must be greater than zero.",
      });
      continue;
    }

    if (Number.isNaN(deadlineMs)) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        remainingMinutes: duration,
        reason: "Add a valid deadline to schedule this task.",
      });
      continue;
    }

    if (deadlineMs < current.getTime()) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        remainingMinutes: duration,
        reason: "The deadline has already passed.",
      });
      continue;
    }

    const deadline = new Date(deadlineMs);
    const deadlineMinute =
      deadline.getFullYear() === current.getFullYear() &&
      deadline.getMonth() === current.getMonth() &&
      deadline.getDate() === current.getDate()
        ? deadline.getHours() * 60 + deadline.getMinutes()
        : endOfDay;
    const latestMinute = Math.min(deadlineMinute, endOfDay);

    if (!task.canSplit) {
      if (remainingBudget < duration) {
        unscheduled.push({
          taskId: task.id,
          title: task.title,
          remainingMinutes: duration,
          reason: "Not enough study time remains for one uninterrupted session.",
        });
        continue;
      }

      if (cursor + duration > latestMinute) {
        unscheduled.push({
          taskId: task.id,
          title: task.title,
          remainingMinutes: duration,
          reason: "There is not enough time before the deadline for one session.",
        });
        continue;
      }

      sessions.push({
        id: `${task.id}-part-1`,
        taskId: task.id,
        title: task.title,
        startMinute: cursor,
        endMinute: cursor + duration,
        durationMinutes: duration,
        part: 1,
        totalParts: 1,
      });
      cursor += duration + BREAK_LENGTH;
      remainingBudget -= duration;
      scheduledMinutes += duration;
      continue;
    }

    let remaining = duration;
    let part = 1;
    while (remaining > 0 && remainingBudget > 0 && cursor < latestMinute) {
      const timeUntilDeadline = latestMinute - cursor;
      const chunk = Math.min(
        SESSION_LENGTH,
        remaining,
        remainingBudget,
        timeUntilDeadline,
      );

      if (chunk <= 0) break;

      sessions.push({
        id: `${task.id}-part-${part}`,
        taskId: task.id,
        title: task.title,
        startMinute: cursor,
        endMinute: cursor + chunk,
        durationMinutes: chunk,
        part,
        totalParts: 0,
      });
      cursor += chunk + BREAK_LENGTH;
      remaining -= chunk;
      remainingBudget -= chunk;
      scheduledMinutes += chunk;
      part += 1;
    }

    const scheduledParts = sessions.filter(
      (session) => session.taskId === task.id,
    );
    for (const session of scheduledParts) {
      session.totalParts = scheduledParts.length;
    }
    if (remaining > 0) {
      const reason =
        remainingBudget === 0
          ? "Some time remains unscheduled because the study-time limit was reached."
          : "Some time remains unscheduled because of the deadline.";
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        remainingMinutes: remaining,
        reason,
      });
    }
  }

  return {
    sessions,
    unscheduled,
    scheduledMinutes,
    availableMinutes: budget,
  };
}
