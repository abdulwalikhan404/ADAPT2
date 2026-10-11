import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import app from "../src/app";

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("Test API did not open a local port.");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

const validPlanInput = {
  world: {
    availability: [{ startMinute: 960, endMinute: 1200 }],
    tasks: [{
      id: "task-math",
      title: "Math revision",
      durationMinutes: 60,
      priority: 5,
      deadlineMinute: 1200,
      canSplit: false,
    }],
  },
};

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("study plan API validates input, runs the C++ engine, repairs disruptions, and reports engine failures", async (t) => {
  await t.test("rejects invalid task priority", async () => {
    const response = await post("/plans", {
      world: {
        ...validPlanInput.world,
        tasks: [{ ...validPlanInput.world.tasks[0], priority: 6 }],
      },
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /priority/i);
  });

  let generatedPlan: { world: typeof validPlanInput.world; plan: Record<string, unknown> };
  await t.test("returns a real plan from the native engine", async () => {
    const response = await post("/plans", validPlanInput);
    assert.equal(response.status, 200);
    generatedPlan = await response.json();
    assert.equal(generatedPlan.plan.name, "initial");
    assert.deepEqual(generatedPlan.plan.chunks, [{
      taskId: "task-math",
      startMinute: 960,
      endMinute: 1020,
    }]);
  });

  await t.test("repairs a lost window using the native engine", async () => {
    const response = await post("/plans/disruptions", {
      world: generatedPlan.world,
      plan: generatedPlan.plan,
      disruption: {
        type: "LostWindow",
        interval: { startMinute: 960, endMinute: 990 },
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.plan.chunks[0].startMinute, 990);
    assert.deepEqual(result.affectedTaskIds, ["task-math"]);
  });

  await t.test("rejects an out-of-window disruption", async () => {
    const response = await post("/plans/disruptions", {
      world: generatedPlan.world,
      plan: generatedPlan.plan,
      disruption: {
        type: "LostWindow",
        interval: { startMinute: 1300, endMinute: 1330 },
      },
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /available time/i);
  });

  await t.test("returns an explicit service error when the engine cannot start", async () => {
    const originalPath = process.env["ADAPT_ENGINE_BIN"];
    process.env["ADAPT_ENGINE_BIN"] = "/tmp/adapt-engine-binary-that-does-not-exist";
    try {
      const response = await post("/plans", validPlanInput);
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /demo scheduler was not used/i);
    } finally {
      if (originalPath === undefined) delete process.env["ADAPT_ENGINE_BIN"];
      else process.env["ADAPT_ENGINE_BIN"] = originalPath;
    }
  });
});
