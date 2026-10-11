#include <cstdio>
#include "../adapt-engine/src/adapt.hpp"
#include <nlohmann/json.hpp>

#include <iostream>
#include <limits>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using json = nlohmann::json;

int intField(const json& value, const char* key) {
  const auto parsed = value.at(key).get<long long>();
  if (parsed < std::numeric_limits<int>::min() ||
      parsed > std::numeric_limits<int>::max()) {
    throw std::out_of_range(std::string(key) + " is outside the engine's integer range");
  }
  return static_cast<int>(parsed);
}

adapt::Interval intervalFromJson(const json& value) {
  return {intField(value, "startMinute"), intField(value, "endMinute")};
}

adapt::Task taskFromJson(const json& value) {
  adapt::Task task;
  task.id = value.at("id").get<std::string>();
  task.title = value.at("title").get<std::string>();
  task.dur = intField(value, "durationMinutes");
  task.prio = intField(value, "priority");
  task.deadline = intField(value, "deadlineMinute");
  task.split = value.at("canSplit").get<bool>();
  return task;
}

adapt::World worldFromJson(const json& value) {
  adapt::World world;
  for (const auto& interval : value.at("availability")) {
    const auto parsed = intervalFromJson(interval);
    if (parsed.s < 0 || parsed.e <= parsed.s) {
      throw std::invalid_argument("availability intervals must have a positive length");
    }
    if (!world.avail.empty() && parsed.s < world.avail.back().e) {
      throw std::invalid_argument("availability intervals must be sorted and non-overlapping");
    }
    world.avail.push_back(parsed);
  }

  for (const auto& item : value.at("tasks")) {
    world.tasks.push_back(taskFromJson(item));
  }

  const auto errors = adapt::validateTasks(world.tasks);
  if (!errors.empty()) {
    std::string message = "invalid tasks";
    for (const auto& error : errors) message += "; " + error;
    throw std::invalid_argument(message);
  }
  return world;
}

json intervalToJson(const adapt::Interval& interval) {
  return {{"startMinute", interval.s}, {"endMinute", interval.e}};
}

json taskToJson(const adapt::Task& task) {
  return {
      {"id", task.id},
      {"title", task.title},
      {"durationMinutes", task.dur},
      {"priority", task.prio},
      {"deadlineMinute", task.deadline},
      {"canSplit", task.split},
  };
}

json worldToJson(const adapt::World& world) {
  json availability = json::array();
  json tasks = json::array();
  for (const auto& interval : world.avail) availability.push_back(intervalToJson(interval));
  for (const auto& task : world.tasks) tasks.push_back(taskToJson(task));
  return {{"availability", availability}, {"tasks", tasks}};
}

adapt::Plan planFromJson(const json& value) {
  adapt::Plan plan;
  plan.name = value.at("name").get<std::string>();
  plan.cost = value.at("cost").get<double>();
  plan.unscheduled = value.at("unscheduledTaskIds").get<std::vector<std::string>>();
  plan.notes = value.at("notes").get<std::vector<std::string>>();
  for (const auto& chunk : value.at("chunks")) {
    plan.chunks.push_back({
        chunk.at("taskId").get<std::string>(),
        intField(chunk, "startMinute"),
        intField(chunk, "endMinute"),
    });
  }
  return plan;
}

json planToJson(const adapt::Plan& plan) {
  json chunks = json::array();
  for (const auto& chunk : plan.chunks) {
    chunks.push_back({
        {"taskId", chunk.id},
        {"startMinute", chunk.s},
        {"endMinute", chunk.e},
    });
  }
  return {
      {"name", plan.name},
      {"chunks", chunks},
      {"unscheduledTaskIds", plan.unscheduled},
      {"cost", plan.cost},
      {"notes", plan.notes},
  };
}

adapt::Disruption disruptionFromJson(const json& value) {
  adapt::Disruption disruption;
  const auto type = value.at("type").get<std::string>();
  if (type == "LostWindow") {
    disruption.type = adapt::Disruption::LostWindow;
    disruption.win = intervalFromJson(value.at("interval"));
  } else if (type == "NewTask") {
    disruption.type = adapt::Disruption::NewTask;
    disruption.task = taskFromJson(value.at("task"));
    const auto errors = adapt::validateTask(disruption.task);
    if (!errors.empty()) throw std::invalid_argument("invalid new task: " + errors.front());
  } else if (type == "DurationChange") {
    disruption.type = adapt::Disruption::DurationChange;
    disruption.id = value.at("taskId").get<std::string>();
    disruption.newDur = intField(value, "newDurationMinutes");
    if (disruption.newDur <= 0) {
      throw std::invalid_argument("new duration must be positive");
    }
  } else {
    throw std::invalid_argument("unsupported disruption type");
  }
  return disruption;
}

json run(const json& request) {
  const auto operation = request.at("operation").get<std::string>();
  if (operation == "plan") {
    const auto world = worldFromJson(request.at("world"));
    const auto plan = adapt::initialPlan(world);
    return {{"world", worldToJson(world)}, {"plan", planToJson(plan)}};
  }

  if (operation == "repair") {
    const auto world = worldFromJson(request.at("world"));
    const auto plan = planFromJson(request.at("plan"));
    const auto disruption = disruptionFromJson(request.at("disruption"));
    const auto result = adapt::repair(plan, world, disruption);

    std::vector<std::string> affected(result.affected.begin(), result.affected.end());
    json candidates = json::array();
    for (const auto& candidate : result.candidates) {
      candidates.push_back(planToJson(candidate));
    }
    return {
        {"world", worldToJson(result.world)},
        {"plan", planToJson(result.best)},
        {"affectedTaskIds", affected},
        {"candidates", candidates},
    };
  }

  throw std::invalid_argument("operation must be 'plan' or 'repair'");
}
}  // namespace

int main() {
  try {
    json request;
    std::cin >> request;
    if (!std::cin || request.is_discarded()) {
      throw std::invalid_argument("expected one JSON request on standard input");
    }
    std::cout << run(request).dump() << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 2;
  }
}
