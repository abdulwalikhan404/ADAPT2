// Worked example from the proposal (Appendix B data): writes before/after schedules for a Mon 16:00-18:00 lost window.
#include "../src/adapt.hpp"
#include <iostream>
using namespace adapt;
int main() {
    World w;
    for (int d = 0; d < 4; ++d) w.avail.push_back({d * 1440 + 960, d * 1440 + 1320});
    w.avail = subtract(w.avail, {1140, 1200});
    auto T = [](const char* id, const char* ti, int dur, int pr, int dl, bool sp) { Task t; t.id = id; t.title = ti; t.dur = dur; t.prio = pr; t.deadline = dl; t.split = sp; return t; };
    w.tasks = {T("A01", "AI quiz revision", 60, 5, 1080, false), T("A02", "OOP practice", 60, 4, 1440 + 1200, true), T("A03", "Math revision", 45, 5, 1260, true),
               T("A04", "English reading", 30, 2, 2880 + 1140, true), T("A05", "Lab report", 90, 4, 4320 + 1020, true)};
    Plan base = initialPlan(w);
    Disruption d; d.type = Disruption::LostWindow; d.win = {960, 1080};
    auto r = repair(base, w, d);
    Plan fixedP = baselineFixed(base, r.world, r.affected), fullP = baselineFull(r.world);
    std::ofstream f("results/demo_schedules.csv");
    f << "plan,task,start,end\n";
    auto dump = [&](const char* n, const Plan& p) { for (auto& c : p.chunks) f << n << "," << c.id << "," << c.s << "," << c.e << "\n"; for (auto& u : p.unscheduled) f << n << "," << u << ",,\n"; };
    dump("before", base); dump("adapt", r.best); dump("fixed", fixedP); dump("full", fullP);
    for (auto* p : {&base, &r.best, &fixedP, &fullP}) {
        std::cout << p->name << ":";
        for (auto& c : p->chunks) std::cout << " " << c.id << "[" << fmtTime(c.s) << "-" << fmtTime(c.e).substr(4) << "]";
        std::cout << " | unscheduled:"; for (auto& u : p->unscheduled) std::cout << " " << u; std::cout << "\n";
    }
    for (auto& n : r.best.notes) std::cout << "NOTE " << n << "\n";
    std::cout << "candidates:"; for (auto& c : r.candidates) std::cout << " " << c.name << "(cost " << c.cost << ")"; std::cout << "\n";
}
