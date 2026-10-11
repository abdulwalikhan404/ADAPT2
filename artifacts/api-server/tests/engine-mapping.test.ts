import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEnginePlanInput,
  toPlannerView,
} from "../../adapt-study-planner/src/lib/engine-adapter";
import type { StudyTask } from "../../adapt-study-planner/src/lib/scheduler";

test("frontend maps local deadlines and renders the native engine response", () => {
  const now = new Date(2026, 9, 11, 8, 2, 0);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tasks: StudyTask[] = [
    {
      id: "task-math",
      title: "Math revision",
      durationMinutes: 45,
      priority: 4,
      deadline: today,
      canSplit: false,
    },
    {
      id: "task-reading",
      title: "Read chapter 6",
      durationMinutes: 30,
      priority: 2,
      deadline: today,
      canSplit: true,
    },
  ];

  const input = buildEnginePlanInput(tasks, 120, now);
  const startMinute = 6 * 24 * 60 + 8 * 60 + 5;
  assert.deepEqual(input.world.availability, [{
    startMinute,
    endMinute: startMinute + 120,
  }]);
  assert.equal(input.world.tasks[0].deadlineMinute, 7 * 24 * 60);

  const view = toPlannerView({
    world: input.world,
    plan: {
      name: "initial",
      chunks: [{ taskId: "task-math", startMinute, endMinute: startMinute + 45 }],
      unscheduledTaskIds: ["task-reading"],
      cost: 0,
      notes: [],
    },
  }, 120);

  assert.equal(view.scheduledMinutes, 45);
  assert.equal(view.availableMinutes, 120);
  assert.equal(view.sessions[0].title, "Math revision");
  assert.equal(view.sessions[0].startMinute, 8 * 60 + 5);
  assert.equal(view.sessions[0].endMinute, 8 * 60 + 50);
  assert.deepEqual(view.unscheduled[0], {
    taskId: "task-reading",
    title: "Read chapter 6",
    remainingMinutes: 30,
    reason: "The C++ engine could not fit this task in the available time before its deadline.",
  });
});
