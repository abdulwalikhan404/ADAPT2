// Runs T1..T10 from the ADAPT test plan and writes results/test_results.csv
#include "../src/adapt.hpp"
#include <cstdio>
#include <iostream>
using namespace adapt;

static World demoWorld() {
    World w;
    for (int d = 0; d < 4; ++d) w.avail.push_back({d * 1440 + 960, d * 1440 + 1320}); // 16:00-22:00 Mon..Thu
    w.avail = subtract(w.avail, {1140, 1200}); // fixed commitment Mon 19:00-20:00
    auto T = [](const char* id, const char* ti, int dur, int pr, int dl, bool sp) {
        Task t; t.id = id; t.title = ti; t.dur = dur; t.prio = pr; t.deadline = dl; t.split = sp; return t; };
    w.tasks = {T("A01", "AI quiz revision", 60, 5, 1080, false), T("A02", "OOP practice", 60, 4, 1440 + 1200, true),
               T("A03", "Math revision", 45, 5, 1260, true), T("A04", "English reading", 30, 2, 2880 + 1140, true),
               T("A05", "Lab report", 90, 4, 4320 + 1020, true)};
    return w;
}

struct Row { std::string id, scenario, evidence; bool pass; };
static std::vector<Row> rows;
static void rec(const char* id, const char* sc, const std::string& ev, bool ok) { rows.push_back({id, sc, ev, ok}); }
static bool usesFixed(const Plan& p) {
    for (auto& c : p.chunks) if (c.s < 1200 && c.e > 1140) return true;
    return false;
}
static int minutesOf(const Plan& p, const std::string& id) { int m = 0; for (auto& c : p.chunks) if (c.id == id) m += c.e - c.s; return m; }

int main() {
    World w = demoWorld();
    Plan base = initialPlan(w);

    { // T1 no disruption (lost window in an empty period)
        Disruption d; d.type = Disruption::LostWindow; d.win = {4 * 1440 + 600, 4 * 1440 + 700};
        auto r = repair(base, w, d);
        Metrics m = measure(r.best, base, r.affected, r.world);
        rec("T1", "No disruption", "tasks moved=" + std::to_string(m.disruption) + ", violations=" + std::to_string(m.violations),
            m.disruption == 0 && m.violations == 0);
    }
    { // T2 lost window Mon 16:00-18:00
        Disruption d; d.type = Disruption::LostWindow; d.win = {960, 1080};
        auto r = repair(base, w, d);
        Metrics m = measure(r.best, base, r.affected, r.world);
        std::string ev = "affected=" + std::to_string(r.affected.size()) + ", moved=" + std::to_string(m.disruption) +
                         ", unnecessary=" + std::to_string(m.unnecessary) + ", unscheduled=" + std::to_string(r.best.unscheduled.size()) +
                         ", fixed Mon19-20 used=" + (usesFixed(r.best) ? "yes" : "no") + ", violations=" + std::to_string(m.violations);
        rec("T2", "Lost study window Mon 16:00-18:00", ev, !usesFixed(r.best) && m.violations == 0 && m.unnecessary == 0 && !r.affected.empty());
        std::cout << "T2 explanations:\n";
        for (auto& n : r.best.notes) std::cout << "  " << n << "\n";
    }
    { // T3 duration increase
        Disruption d; d.type = Disruption::DurationChange; d.id = "A02"; d.newDur = 120;
        auto r = repair(base, w, d);
        Metrics m = measure(r.best, base, r.affected, r.world);
        int mins = minutesOf(r.best, "A02");
        rec("T3", "A02 duration 60 -> 120 min", "A02 scheduled minutes=" + std::to_string(mins) + ", violations=" + std::to_string(m.violations) +
            ", unnecessary moves=" + std::to_string(m.unnecessary), m.violations == 0 && (mins == 120 || r.best.unscheduled.size() > 0));
    }
    { // T4 urgent new task
        Disruption d; d.type = Disruption::NewTask;
        d.task.id = "N01"; d.task.title = "Urgent assignment"; d.task.dur = 60; d.task.prio = 5; d.task.deadline = 1440 + 720; d.task.split = false;
        // Tue 12:00 deadline, but no study window before then except Mon evening
        auto r = repair(base, w, d);
        Metrics m = measure(r.best, base, r.affected, r.world);
        bool placed = minutesOf(r.best, "N01") == 60;
        bool reason = !r.best.notes.empty();
        rec("T4", "Urgent new task N01 (prio 5, 60 min, Tue 12:00)", std::string("N01 placed=") + (placed ? "yes" : "no") + ", strategy=" + r.best.name +
            ", notes=" + std::to_string(r.best.notes.size()) + ", violations=" + std::to_string(m.violations), m.violations == 0 && reason);
    }
    { // T5 impossible workload
        World w2 = w;
        for (int i = 0; i < 8; ++i) { Task t; t.id = "X" + std::to_string(i); t.title = "Big"; t.dur = 120; t.prio = 3; t.deadline = 1400; t.split = true; w2.tasks.push_back(t); }
        Plan p = initialPlan(w2);
        Metrics m = measure(p, Plan{}, {}, w2);
        rec("T5", "Impossible workload (8 extra 2-h tasks due Mon 23:20)", "unscheduled=" + std::to_string(p.unscheduled.size()) +
            ", false-feasible claim=" + (p.unscheduled.empty() ? "yes" : "no") + ", violations=" + std::to_string(m.violations),
            !p.unscheduled.empty() && m.violations == 0);
    }
    { // T6 invalid input
        std::vector<Task> bad(3);
        bad[0].id = "B1"; bad[0].title = "x"; bad[0].dur = -5; bad[0].prio = 3; bad[0].deadline = 100;
        bad[1].id = "B2"; bad[1].title = ""; bad[1].dur = 30; bad[1].prio = 3; bad[1].deadline = 100;
        bad[2].id = "B3"; bad[2].title = "x"; bad[2].dur = 30; bad[2].prio = 9; bad[2].deadline = 100;
        auto e = validateTasks(bad);
        rec("T6", "Negative duration, missing title, priority 9", std::to_string(e.size()) + " validation errors, no crash", e.size() == 3);
    }
    { // T7 feedback update
        Estimator es; es.set("coding", 60);
        bool ok1 = es.update("coding", 80);
        double v = es.est["coding"].first;
        bool ok2 = es.update("coding", -5);
        char b[96]; std::snprintf(b, sizeof b, "E: 60 -> %.1f (expected 66.0); invalid actual ignored=%s", v, ok2 ? "no" : "yes");
        rec("T7", "alpha=0.3, E=60, A=80", b, ok1 && std::fabs(v - 66.0) < 1e-9 && !ok2);
    }
    { // T8 repeated disruption on approved plan
        Session s; s.start(w);
        Disruption d1; d1.type = Disruption::LostWindow; d1.win = {960, 1080};
        s.propose(d1); s.approve();
        Plan afterFirst = s.approved;
        Disruption d2; d2.type = Disruption::DurationChange; d2.id = "A05"; d2.newDur = 150;
        auto& r = s.propose(d2);
        Metrics m = measure(r.best, afterFirst, r.affected, r.world);
        s.approve();
        rec("T8", "Second disruption on the approved revised plan", "history entries=" + std::to_string(s.log.size()) + ", unnecessary moves=" +
            std::to_string(m.unnecessary) + ", violations=" + std::to_string(m.violations), s.log.size() == 5 && m.violations == 0 && m.unnecessary == 0);
    }
    { // T9 reject
        Session s; s.start(w);
        Plan before = s.approved;
        Disruption d; d.type = Disruption::LostWindow; d.win = {960, 1080};
        s.propose(d); s.reject("prefer to keep Monday evening free");
        bool same = s.approved.chunks.size() == before.chunks.size();
        for (auto& c : before.chunks) if (!sameSchedule(s.approved, before, c.id)) same = false;
        rec("T9", "User rejects suggestion", std::string("approved plan unchanged=") + (same ? "yes" : "no") + ", last log=\"" + s.log.back() + "\"",
            same && s.log.back().rfind("REJECT", 0) == 0);
    }
    { // T10 malformed file / duplicate ids
        { std::ofstream f("results/bad1.csv"); f << "id,title,duration_min,priority,deadline_min,splittable\nA1,Test,60,3,1000,1\nA2,Broken,abc,3,1000,1\n"; }
        { std::ofstream f("results/bad2.csv"); f << "id,title,duration_min,priority,deadline_min,splittable\nA1,Test,60,3,1000,1\nA1,Dup,30,3,1000,0\n"; }
        { std::ofstream f("results/good.csv"); f << "id,title,duration_min,priority,deadline_min,splittable\nA1,Test,60,3,1000,1\nA2,Fine,30,2,1200,0\n"; }
        auto a = loadTasksCSV("results/bad1.csv"), b = loadTasksCSV("results/bad2.csv"), g = loadTasksCSV("results/good.csv");
        bool ok = !a.errors.empty() && a.tasks.empty() && !b.errors.empty() && b.tasks.empty() && g.errors.empty() && g.tasks.size() == 2;
        rec("T10", "Malformed numeric field; duplicate id; valid control file", "malformed errors=" + std::to_string(a.errors.size()) +
            ", duplicate errors=" + std::to_string(b.errors.size()) + ", control loaded tasks=" + std::to_string(g.tasks.size()), ok);
        std::remove("results/bad1.csv"); std::remove("results/bad2.csv"); std::remove("results/good.csv");
    }

    std::ofstream out("results/test_results.csv");
    out << "test_id,scenario,actual_output,result\n";
    int pass = 0;
    for (auto& r : rows) {
        out << r.id << ",\"" << r.scenario << "\",\"" << r.evidence << "\"," << (r.pass ? "PASS" : "FAIL") << "\n";
        std::cout << r.id << "  " << (r.pass ? "PASS" : "FAIL") << "  " << r.scenario << " | " << r.evidence << "\n";
        pass += r.pass;
    }
    std::cout << pass << "/" << rows.size() << " passed\n";
    return pass == (int)rows.size() ? 0 : 1;
}
