import { Router, type IRouter } from "express";
import {
  GenerateStudyPlanBody,
  GenerateStudyPlanResponse,
  RepairStudyPlanBody,
  RepairStudyPlanResponse,
  type StudyPlan,
  type StudyPlanDisruption,
  type StudyWorld,
} from "@workspace/api-zod";
import { runAdaptEngine } from "../services/adaptEngine";

const router: IRouter = Router();

function validateWorld(world: StudyWorld): string | null {
  const taskIds = new Set<string>();
  for (const task of world.tasks) {
    if (!task.id.trim()) return "Task IDs must not be blank.";
    if (!task.title.trim()) return "Task titles must not be blank.";
    if (taskIds.has(task.id)) return `Duplicate task ID: ${task.id}`;
    taskIds.add(task.id);
  }

  let previousEnd = -1;
  for (const interval of world.availability) {
    if (interval.endMinute <= interval.startMinute) {
      return "Availability intervals must have a positive length.";
    }
    if (interval.startMinute < previousEnd) {
      return "Availability intervals must be sorted and non-overlapping.";
    }
    previousEnd = interval.endMinute;
  }
  return null;
}

function validatePlan(world: StudyWorld, plan: StudyPlan): string | null {
  const tasks = new Map(world.tasks.map((task) => [task.id, task]));
  const unscheduled = new Set(plan.unscheduledTaskIds);
  if (unscheduled.size !== plan.unscheduledTaskIds.length) {
    return "The plan contains duplicate unscheduled task IDs.";
  }
  for (const taskId of unscheduled) {
    if (!tasks.has(taskId)) return `Unknown unscheduled task ID: ${taskId}`;
  }

  const minutes = new Map<string, number>();
  const chunksPerTask = new Map<string, number>();
  const sortedChunks = [...plan.chunks].sort((a, b) => a.startMinute - b.startMinute);
  for (let index = 0; index < sortedChunks.length; index += 1) {
    const chunk = sortedChunks[index];
    const task = tasks.get(chunk.taskId);
    if (!task) return `Unknown task ID in plan: ${chunk.taskId}`;
    if (chunk.endMinute <= chunk.startMinute) return "Plan chunks must have a positive length.";
    if (chunk.endMinute > task.deadlineMinute) {
      return `Plan chunk for ${chunk.taskId} is after its deadline.`;
    }
    if (!world.availability.some(
      (interval) => chunk.startMinute >= interval.startMinute && chunk.endMinute <= interval.endMinute,
    )) {
      return `Plan chunk for ${chunk.taskId} is outside available time.`;
    }
    if (index > 0 && sortedChunks[index - 1].endMinute > chunk.startMinute) {
      return "Plan chunks must not overlap.";
    }
    minutes.set(chunk.taskId, (minutes.get(chunk.taskId) ?? 0) + chunk.endMinute - chunk.startMinute);
    chunksPerTask.set(chunk.taskId, (chunksPerTask.get(chunk.taskId) ?? 0) + 1);
  }

  for (const task of world.tasks) {
    const scheduledMinutes = minutes.get(task.id) ?? 0;
    const chunkCount = chunksPerTask.get(task.id) ?? 0;
    if (unscheduled.has(task.id)) {
      if (scheduledMinutes > 0) return `${task.id} is both scheduled and unscheduled.`;
    } else if (scheduledMinutes !== task.durationMinutes) {
      return `${task.id} does not have its full duration scheduled.`;
    }
    if (!task.canSplit && chunkCount > 1) {
      return `${task.id} is not splittable but has multiple chunks.`;
    }
  }
  return null;
}

function validateDisruption(world: StudyWorld, disruption: StudyPlanDisruption): string | null {
  if (disruption.type === "LostWindow") {
    const { startMinute, endMinute } = disruption.interval;
    if (endMinute <= startMinute) return "The lost interval must have a positive length.";
    if (!world.availability.some(
      (interval) => startMinute >= interval.startMinute && endMinute <= interval.endMinute,
    )) {
      return "The lost interval must be inside currently available time.";
    }
    return null;
  }

  if (disruption.type === "NewTask") {
    if (world.tasks.some((task) => task.id === disruption.task.id)) {
      return `Task ID already exists: ${disruption.task.id}`;
    }
    return validateWorld({ ...world, tasks: [...world.tasks, disruption.task] });
  }

  if (!world.tasks.some((task) => task.id === disruption.taskId)) {
    return `Cannot change duration for unknown task ID: ${disruption.taskId}`;
  }
  return null;
}

router.post("/plans", async (req, res): Promise<void> => {
  const parsed = GenerateStudyPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const worldError = validateWorld(parsed.data.world);
  if (worldError) {
    res.status(400).json({ error: worldError });
    return;
  }

  try {
    const result = await runAdaptEngine<unknown>({
      operation: "plan",
      world: parsed.data.world,
    });
    res.json(GenerateStudyPlanResponse.parse(result));
  } catch (err) {
    req.log.error({ err }, "Native ADAPT engine failed to generate a plan");
    res.status(503).json({ error: "Native ADAPT engine failed. The demo scheduler was not used." });
  }
});

router.post("/plans/disruptions", async (req, res): Promise<void> => {
  const parsed = RepairStudyPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { world, plan, disruption } = parsed.data;
  const worldError = validateWorld(world);
  if (worldError) {
    res.status(400).json({ error: worldError });
    return;
  }
  const planError = validatePlan(world, plan);
  if (planError) {
    res.status(400).json({ error: planError });
    return;
  }
  const disruptionError = validateDisruption(world, disruption);
  if (disruptionError) {
    res.status(400).json({ error: disruptionError });
    return;
  }

  try {
    const result = await runAdaptEngine<unknown>({
      operation: "repair",
      world,
      plan,
      disruption,
    });
    res.json(RepairStudyPlanResponse.parse(result));
  } catch (err) {
    req.log.error({ err }, "Native ADAPT engine failed to repair a plan");
    res.status(503).json({ error: "Native ADAPT engine failed. The demo scheduler was not used." });
  }
});

export default router;
