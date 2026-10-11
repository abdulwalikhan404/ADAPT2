import type { StudyPlanInput, StudyPlanResult } from "@workspace/api-client-react";
import type { StudyPlan as PlannerView, StudyTask } from "./scheduler";

const MINUTES_PER_DAY = 24 * 60;
const MAX_ENGINE_MINUTE = 2_147_483_647;

function utcDayNumber(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 86_400_000);
}

function deadlineMinute(value: string, now: Date): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`“${value}” is not a valid deadline date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetDate = new Date(0);
  targetDate.setUTCFullYear(year, month - 1, day);
  targetDate.setUTCHours(0, 0, 0, 0);
  if (
    targetDate.getUTCFullYear() !== year ||
    targetDate.getUTCMonth() !== month - 1 ||
    targetDate.getUTCDate() !== day
  ) {
    throw new Error(`“${value}” is not a valid deadline date.`);
  }
  const targetDay = Math.floor(targetDate.getTime() / 86_400_000);
  const currentDay = utcDayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const mondayBasedWeekday = (now.getDay() + 6) % 7;
  const dueMinute = Math.max(
    1,
    (mondayBasedWeekday + targetDay - currentDay + 1) * MINUTES_PER_DAY,
  );
  if (dueMinute > MAX_ENGINE_MINUTE) {
    throw new Error("Choose a deadline within the engine’s supported date range.");
  }
  return dueMinute;
}

export function buildEnginePlanInput(
  tasks: StudyTask[],
  availableMinutes: number,
  now: Date,
): StudyPlanInput {
  const weekdayOffset = (now.getDay() + 6) % 7;
  const todayStart = weekdayOffset * MINUTES_PER_DAY;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const startMinute = todayStart + Math.ceil(currentMinute / 5) * 5;
  const endMinute = Math.min(
    startMinute + Math.max(0, Math.floor(availableMinutes)),
    todayStart + MINUTES_PER_DAY,
  );
  const availability =
    endMinute > startMinute ? [{ startMinute, endMinute }] : [];

  return {
    world: {
      availability,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        durationMinutes: task.durationMinutes,
        priority: task.priority,
        deadlineMinute: deadlineMinute(task.deadline, now),
        canSplit: task.canSplit,
      })),
    },
  };
}

export function getAvailableMinutes(result: StudyPlanResult): number {
  return result.world.availability.reduce(
    (total, interval) => total + interval.endMinute - interval.startMinute,
    0,
  );
}

export function toPlannerView(result: StudyPlanResult, availableMinutes: number): PlannerView {
  const tasks = new Map(result.world.tasks.map((task) => [task.id, task]));
  const chunks = [...result.plan.chunks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const counts = new Map<string, number>();
  for (const chunk of chunks) counts.set(chunk.taskId, (counts.get(chunk.taskId) ?? 0) + 1);

  const partNumbers = new Map<string, number>();
  const sessions = chunks.map((chunk) => {
    const part = (partNumbers.get(chunk.taskId) ?? 0) + 1;
    partNumbers.set(chunk.taskId, part);
    const task = tasks.get(chunk.taskId);
    const durationMinutes = chunk.endMinute - chunk.startMinute;
    return {
      id: `${chunk.taskId}-${chunk.startMinute}-${chunk.endMinute}`,
      taskId: chunk.taskId,
      title: task?.title ?? chunk.taskId,
      startMinute: ((chunk.startMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY,
      endMinute: ((chunk.endMinute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY,
      durationMinutes,
      part,
      totalParts: counts.get(chunk.taskId) ?? 1,
    };
  });

  const scheduledByTask = new Map<string, number>();
  for (const chunk of chunks) {
    scheduledByTask.set(
      chunk.taskId,
      (scheduledByTask.get(chunk.taskId) ?? 0) + chunk.endMinute - chunk.startMinute,
    );
  }
  const firstStartMinute = result.world.availability[0]?.startMinute;
  const unscheduled = result.plan.unscheduledTaskIds.map((taskId) => {
    const task = tasks.get(taskId);
    const durationMinutes = task?.durationMinutes ?? 0;
    const remainingMinutes = Math.max(0, durationMinutes - (scheduledByTask.get(taskId) ?? 0));
    const deadlinePassed =
      task !== undefined &&
      firstStartMinute !== undefined &&
      task.deadlineMinute <= firstStartMinute;

    return {
      taskId,
      title: task?.title ?? taskId,
      remainingMinutes,
      reason: deadlinePassed
        ? "The deadline has passed."
        : "The C++ engine could not fit this task in the available time before its deadline.",
    };
  });

  return {
    sessions,
    unscheduled,
    scheduledMinutes: chunks.reduce(
      (total, chunk) => total + chunk.endMinute - chunk.startMinute,
      0,
    ),
    availableMinutes,
  };
}
