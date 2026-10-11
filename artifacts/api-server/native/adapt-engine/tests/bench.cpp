// Benchmark: ADAPT selective repair vs fixed plan vs full reschedule.
// 3 load levels x 3 disruption types x 100 seeds = 900 scenarios (seed 2026). Writes results/benchmark.csv, results/scale.csv
#include "../src/adapt.hpp"
#include <iostream>
#include <random>
using namespace adapt;
using Clock = std::chrono::steady_clock;

static World genWorld(std::mt19937& g, int n, int days) {
    World w;
    for (int d = 0; d < days; ++d) {
        w.avail.push_back({d * 1440 + 540, d * 1440 + 720});
        w.avail.push_back({d * 1440 + 960, d * 1440 + 1320});
    }
    for (int d = 0; d < days; ++d)
        if (g() % 2) { int s = d * 1440 + 540 + 30 * (g() % 24); w.avail = subtract(w.avail, {s, s + 60}); } // fixed commitment
    for (int i = 0; i < n; ++i) {
        Task t;
        char b[16]; std::snprintf(b, sizeof b, "T%03d", i);
        t.id = b; t.title = "task"; t.dur = 15 * (2 + g() % 7); t.prio = 1 + g() % 5; t.split = (g() % 10) < 6;
        int day = g() % std::min(days, 4);
        t.deadline = day * 1440 + 720 + 30 * (g() % 20);
        w.tasks.push_back(t);
    }
    return w;
}

static long long us(Clock::time_point a, Clock::time_point b) { return std::chrono::duration_cast<std::chrono::microseconds>(b - a).count(); }

int main() {
    std::ofstream out("results/benchmark.csv");
    out << "w_unsched,scenario,load_tasks,disruption,strategy,method,total_tasks,scheduled,unsched_weight,all_scheduled,disruption_count,unnecessary_moves,violations,runtime_us\n";
    std::mt19937 g(2026);
    int sid = 0;
    for (double wu : {200.0, 50.0, 20.0, 10.0, 5.0}) {
    W_UNSCHED = wu; g.seed(2026); sid = 0;
    for (int n : {8, 14, 20})
        for (int dt = 0; dt < 3; ++dt)
            for (int rep = 0; rep < 100; ++rep, ++sid) {
                World w = genWorld(g, n, 4);
                Plan base = initialPlan(w);
                Disruption d;
                if (!base.chunks.empty() && dt == 0) { // lost window overlapping a scheduled task
                    auto& c = base.chunks[g() % base.chunks.size()];
                    int len = 120 + 30 * (g() % 5);
                    d.type = Disruption::LostWindow; d.win = {c.s, c.s + len};
                } else if (!base.chunks.empty() && dt == 2) { // duration grows 25%..100% on a scheduled task
                    auto& c = base.chunks[g() % base.chunks.size()];
                    int cur = 0; for (auto& t : w.tasks) if (t.id == c.id) cur = t.dur;
                    int nd = cur + 15 * (1 + (int)(g() % std::max(1, cur / 15)));
                    d.type = Disruption::DurationChange; d.id = c.id; d.newDur = nd;
                } else { // urgent new task
                    d.type = Disruption::NewTask; d.task.id = "NEW"; d.task.title = "urgent";
                    d.task.dur = 60 + 15 * (g() % 5); d.task.prio = 5; d.task.split = (g() % 2); d.task.deadline = (g() % 3) * 1440 + 720 + 30 * (g() % 20);
                }
                const char* dname = d.type == Disruption::LostWindow ? "lost_window" : d.type == Disruption::NewTask ? "new_task" : "duration_change";

                auto t0 = Clock::now();
                RepairResult r = repair(base, w, d);
                auto t1 = Clock::now();
                Plan fixed = baselineFixed(base, r.world, r.affected);
                auto t2 = Clock::now();
                Plan full = baselineFull(r.world);
                auto t3 = Clock::now();
                struct { const char* m; Plan* p; long long t; } M[] = {{"fixed_plan", &fixed, us(t1, t2)}, {"full_reschedule", &full, us(t2, t3)}, {"adapt_selective", &r.best, us(t0, t1)}};
                for (auto& x : M) {
                    Metrics m = measure(*x.p, base, r.affected, r.world);
                    out << wu << "," << sid << "," << n << "," << dname << "," << (x.p == &r.best ? r.best.name : std::string("-")) << "," << x.m << "," << m.total << "," << m.scheduled << "," << m.unschedWeight << ","
                        << m.allScheduled << "," << m.disruption << "," << m.unnecessary << "," << m.violations << "," << x.t << "\n";
                }
            }
    }
    W_UNSCHED = 200.0;

    // scale test (runtime target NFR-04: 100 tasks < 2 s)
    std::ofstream sc("results/scale.csv");
    sc << "tasks,repair_adapt_us_median,full_reschedule_us_median\n";
    for (int n : {25, 50, 100, 200, 400}) {
        std::vector<long long> a, f;
        for (int rep = 0; rep < 21; ++rep) {
            World w = genWorld(g, n, 40);
            for (auto& t : w.tasks) t.deadline += 1440 * (g() % 30);
            Plan base = initialPlan(w);
            Disruption d; d.type = Disruption::LostWindow;
            int s = base.chunks.empty() ? 600 : base.chunks[base.chunks.size() / 2].s;
            d.win = {s, s + 240};
            auto t0 = Clock::now(); RepairResult r = repair(base, w, d); auto t1 = Clock::now();
            Plan full = baselineFull(r.world); auto t2 = Clock::now();
            a.push_back(us(t0, t1)); f.push_back(us(t1, t2));
        }
        std::sort(a.begin(), a.end()); std::sort(f.begin(), f.end());
        sc << n << "," << a[10] << "," << f[10] << "\n";
    }
    std::cout << "scenarios: " << sid << "\n";
}
