// ADAPT Stage-1 engine: scheduler, selective repair, baselines, estimator, CSV I/O.
// C++17, standard library only.
#pragma once
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

namespace adapt {

struct Interval { int s, e; };

struct Task {
    std::string id, title, category;
    int dur = 0;        // minutes
    int prio = 3;       // 1..5 (5 = most important)
    int deadline = 0;   // absolute minute since Monday 00:00 (HARD deadline)
    bool split = false; // may be placed in several chunks
};

struct Chunk { std::string id; int s, e; };

struct Plan {
    std::string name;
    std::vector<Chunk> chunks;
    std::vector<std::string> unscheduled;
    double cost = 0;
    std::vector<std::string> notes;
};

struct World {
    std::vector<Interval> avail; // sorted free study time (fixed commitments already removed)
    std::vector<Task> tasks;
};

inline std::string fmtTime(int m) {
    static const char* d[] = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"};
    char b[32];
    std::snprintf(b, sizeof b, "%s %02d:%02d", d[(m / 1440) % 7], (m % 1440) / 60, m % 60);
    return b;
}

inline std::vector<Interval> subtract(const std::vector<Interval>& a, Interval b) {
    std::vector<Interval> r;
    for (auto x : a) {
        if (b.e <= x.s || b.s >= x.e) { r.push_back(x); continue; }
        if (b.s > x.s) r.push_back({x.s, b.s});
        if (b.e < x.e) r.push_back({b.e, x.e});
    }
    return r;
}

// ---------- validation ----------
inline std::vector<std::string> validateTask(const Task& t) {
    std::vector<std::string> e;
    if (t.id.empty()) e.push_back("missing id");
    if (t.title.empty()) e.push_back(t.id + ": missing title");
    if (t.dur <= 0) e.push_back(t.id + ": duration must be positive");
    if (t.prio < 1 || t.prio > 5) e.push_back(t.id + ": priority must be 1..5");
    if (t.deadline <= 0) e.push_back(t.id + ": deadline must be positive");
    return e;
}
inline std::vector<std::string> validateTasks(const std::vector<Task>& ts) {
    std::vector<std::string> e;
    std::set<std::string> seen;
    for (auto& t : ts) {
        for (auto& m : validateTask(t)) e.push_back(m);
        if (!seen.insert(t.id).second) e.push_back(t.id + ": duplicate id");
    }
    return e;
}

// ---------- scheduling heuristic ----------
inline std::vector<const Task*> orderTasks(std::vector<const Task*> v) {
    std::stable_sort(v.begin(), v.end(), [](const Task* a, const Task* b) {
        if (a->deadline != b->deadline) return a->deadline < b->deadline; // earliest deadline first
        if (a->prio != b->prio) return a->prio > b->prio;                 // then higher priority
        return a->dur < b->dur;                                           // then shorter
    });
    return v;
}

inline bool placeTask(const Task& t, std::vector<Interval>& freeT, std::vector<Chunk>& out) {
    if (!t.split) {
        for (size_t i = 0; i < freeT.size(); ++i) {
            int s = freeT[i].s;
            if (s + t.dur <= freeT[i].e && s + t.dur <= t.deadline) {
                out.push_back({t.id, s, s + t.dur});
                freeT = subtract(freeT, {s, s + t.dur});
                return true;
            }
        }
        return false;
    }
    std::vector<Chunk> tmp;
    int rem = t.dur;
    for (size_t i = 0; i < freeT.size() && rem > 0; ++i) {
        int s = freeT[i].s, e = std::min(freeT[i].e, t.deadline);
        if (e <= s) continue;
        int take = std::min(rem, e - s);
        tmp.push_back({t.id, s, s + take});
        rem -= take;
    }
    if (rem > 0) return false;
    for (auto& c : tmp) { freeT = subtract(freeT, {c.s, c.e}); out.push_back(c); }
    return true;
}

inline Plan buildPlan(const std::vector<const Task*>& toPlace, const std::vector<Interval>& avail,
                      const std::vector<Chunk>& frozen, const std::string& name) {
    Plan p;
    p.name = name;
    p.chunks = frozen;
    auto freeT = avail;
    for (auto& c : frozen) freeT = subtract(freeT, {c.s, c.e});
    for (auto* t : orderTasks(toPlace))
        if (!placeTask(*t, freeT, p.chunks)) p.unscheduled.push_back(t->id);
    std::sort(p.chunks.begin(), p.chunks.end(), [](const Chunk& a, const Chunk& b) { return a.s < b.s; });
    return p;
}

inline Plan initialPlan(const World& w) {
    std::vector<const Task*> all;
    for (auto& t : w.tasks) all.push_back(&t);
    return buildPlan(all, w.avail, {}, "initial");
}

// ---------- hard-constraint check ----------
inline std::vector<std::string> violations(const Plan& p, const World& w) {
    std::vector<std::string> v;
    std::map<std::string, const Task*> byId;
    for (auto& t : w.tasks) byId[t.id] = &t;
    std::map<std::string, int> minutes;
    for (auto& c : p.chunks) {
        auto it = byId.find(c.id);
        if (it == byId.end()) { v.push_back("unknown task " + c.id); continue; }
        minutes[c.id] += c.e - c.s;
        if (c.e > it->second->deadline) v.push_back(c.id + ": past deadline");
        bool inside = false;
        for (auto& a : w.avail) if (c.s >= a.s && c.e <= a.e) inside = true;
        if (!inside) v.push_back(c.id + ": outside available time / overlaps fixed commitment");
        if (!it->second->split) {
            int n = 0;
            for (auto& d : p.chunks) if (d.id == c.id) ++n;
            if (n > 1) v.push_back(c.id + ": non-splittable task split");
        }
    }
    for (size_t i = 0; i < p.chunks.size(); ++i)
        for (size_t j = i + 1; j < p.chunks.size(); ++j)
            if (p.chunks[i].s < p.chunks[j].e && p.chunks[j].s < p.chunks[i].e) v.push_back("overlap");
    std::set<std::string> uns(p.unscheduled.begin(), p.unscheduled.end());
    for (auto& t : w.tasks) {
        if (uns.count(t.id)) { if (minutes.count(t.id)) v.push_back(t.id + ": listed unscheduled but has chunks"); }
        else if (minutes[t.id] != t.dur) v.push_back(t.id + ": scheduled minutes != duration");
    }
    return v;
}

// ---------- disruptions ----------
struct Disruption {
    enum Type { LostWindow, NewTask, DurationChange } type = LostWindow;
    Interval win{0, 0};
    Task task;
    std::string id;
    int newDur = 0;
    std::string label() const {
        if (type == LostWindow) return "lost window " + fmtTime(win.s) + "-" + fmtTime(win.e).substr(4);
        if (type == NewTask) return "new task " + task.id;
        return "duration of " + id + " -> " + std::to_string(newDur) + " min";
    }
};

inline std::set<std::string> applyDisruption(World& w, const Plan& old, const Disruption& d) {
    std::set<std::string> aff;
    if (d.type == Disruption::LostWindow) {
        w.avail = subtract(w.avail, d.win);
        for (auto& c : old.chunks) if (c.s < d.win.e && c.e > d.win.s) aff.insert(c.id);
    } else if (d.type == Disruption::NewTask) {
        w.tasks.push_back(d.task);
        aff.insert(d.task.id);
    } else {
        for (auto& t : w.tasks) if (t.id == d.id) t.dur = d.newDur;
        aff.insert(d.id);
    }
    return aff;
}

// ---------- metrics ----------
struct Metrics {
    int total = 0, scheduled = 0, unschedWeight = 0, disruption = 0, unnecessary = 0, violations = 0;
    bool allScheduled = false;
};

inline std::vector<Chunk> chunksOf(const Plan& p, const std::string& id) {
    std::vector<Chunk> r;
    for (auto& c : p.chunks) if (c.id == id) r.push_back(c);
    std::sort(r.begin(), r.end(), [](const Chunk& a, const Chunk& b) { return a.s < b.s; });
    return r;
}
inline bool sameSchedule(const Plan& a, const Plan& b, const std::string& id) {
    auto x = chunksOf(a, id), y = chunksOf(b, id);
    if (x.size() != y.size()) return false;
    for (size_t i = 0; i < x.size(); ++i) if (x[i].s != y[i].s || x[i].e != y[i].e) return false;
    return true;
}

inline Metrics measure(const Plan& p, const Plan& old, const std::set<std::string>& affected, const World& w) {
    Metrics m;
    m.total = (int)w.tasks.size();
    m.unschedWeight = 0;
    for (auto& id : p.unscheduled)
        for (auto& t : w.tasks) if (t.id == id) m.unschedWeight += t.prio;
    m.scheduled = m.total - (int)p.unscheduled.size();
    m.allScheduled = p.unscheduled.empty();
    std::set<std::string> prev;
    for (auto& c : old.chunks) prev.insert(c.id);
    for (auto& id : prev)
        if (!sameSchedule(p, old, id)) {
            ++m.disruption;
            if (!affected.count(id)) ++m.unnecessary;
        }
    m.violations = (int)violations(p, w).size();
    return m;
}

inline double W_UNSCHED = 200.0, W_UNNEC = 3.0, W_DISRUPT = 1.0; // tunable cost weights
inline double planCost(const Metrics& m) { return W_UNSCHED * m.unschedWeight + W_UNNEC * m.unnecessary + W_DISRUPT * m.disruption; }

// ---------- selective repair ----------
struct RepairResult {
    Plan best;
    World world;
    std::set<std::string> affected;
    std::vector<Plan> candidates;
};

inline Plan candidate(const World& w, const Plan& old, const std::set<std::string>& unfrozen, const std::string& name) {
    std::vector<Chunk> frozen;
    std::set<std::string> frozenIds;
    for (auto& c : old.chunks) {
        if (unfrozen.count(c.id)) continue;
        bool inside = false;
        for (auto& a : w.avail) if (c.s >= a.s && c.e <= a.e) inside = true;
        if (inside) { frozen.push_back(c); frozenIds.insert(c.id); }
    }
    std::vector<const Task*> toPlace;
    for (auto& t : w.tasks) if (!frozenIds.count(t.id)) toPlace.push_back(&t);
    return buildPlan(toPlace, w.avail, frozen, name);
}

inline void explain(Plan& p, const Plan& old, const World& w, const std::set<std::string>& aff) {
    std::set<std::string> ids;
    for (auto& c : old.chunks) ids.insert(c.id);
    for (auto& id : ids) {
        if (sameSchedule(p, old, id)) { continue; }
        std::string why = aff.count(id) ? "directly affected by the disruption" : "unaffected, but moved to keep a higher-value task feasible";
        auto n = chunksOf(p, id);
        if (n.empty()) p.notes.push_back(id + " cannot be scheduled before its deadline (" + why + ")");
        else p.notes.push_back(id + " moved to " + fmtTime(n[0].s) + " (" + why + ")");
    }
    for (auto& id : aff) {
        bool wasOld = false;
        for (auto& c : old.chunks) if (c.id == id) wasOld = true;
        if (wasOld) continue;
        auto n = chunksOf(p, id);
        if (n.empty()) p.notes.push_back(id + " cannot be scheduled before its deadline");
        else p.notes.push_back(id + " placed at " + fmtTime(n[0].s));
    }
    (void)w;
}

inline RepairResult repair(const Plan& old, const World& oldWorld, const Disruption& d) {
    RepairResult r;
    r.world = oldWorld;
    r.affected = applyDisruption(r.world, old, d);
    const World& w = r.world;

    // C1: freeze every unaffected task
    Plan c1 = candidate(w, old, r.affected, "selective");
    r.candidates.push_back(c1);

    // Escalate only if the disruption caused NEW unscheduled tasks (not tasks that were already unscheduled)
    std::set<std::string> oldScheduled;
    for (auto& c : old.chunks) oldScheduled.insert(c.id);
    std::vector<std::string> newlyUnsched;
    for (auto& id : c1.unscheduled) {
        bool wasUnsched = false;
        for (auto& t : oldWorld.tasks) if (t.id == id && !oldScheduled.count(id)) wasUnsched = true;
        if (!wasUnsched) newlyUnsched.push_back(id);
    }
    if (!newlyUnsched.empty()) {
        // C2: also allow tasks with later deadlines to move
        int minDl = 1 << 30;
        for (auto& id : newlyUnsched)
            for (auto& t : w.tasks) if (t.id == id) minDl = std::min(minDl, t.deadline);
        auto un = r.affected;
        for (auto& t : w.tasks) if (t.deadline > minDl) un.insert(t.id);
        r.candidates.push_back(candidate(w, old, un, "expanded"));
        // C3: full reschedule as a last resort
        std::set<std::string> all;
        for (auto& t : w.tasks) all.insert(t.id);
        r.candidates.push_back(candidate(w, old, all, "full"));
    }

    bool have = false;
    for (auto& c : r.candidates) {
        Metrics m = measure(c, old, r.affected, w);
        c.cost = planCost(m);
        if (m.violations > 0) continue; // hard constraints disqualify
        if (!have || c.cost < r.best.cost) { r.best = c; have = true; }
    }
    explain(r.best, old, w, r.affected);
    return r;
}

// ---------- baselines ----------
inline Plan baselineFixed(const Plan& old, const World& w, const std::set<std::string>& aff) {
    Plan p;
    p.name = "fixed";
    for (auto& c : old.chunks) if (!aff.count(c.id)) p.chunks.push_back(c);
    for (auto& t : w.tasks) {
        bool kept = false;
        for (auto& c : p.chunks) if (c.id == t.id) kept = true;
        if (!kept) p.unscheduled.push_back(t.id);
    }
    return p;
}
inline Plan baselineFull(const World& w) {
    std::vector<const Task*> all;
    for (auto& t : w.tasks) all.push_back(&t);
    Plan p = buildPlan(all, w.avail, {}, "full");
    return p;
}

// ---------- duration estimator ----------
struct Estimator {
    double alpha = 0.3;
    std::map<std::string, std::pair<double, int>> est; // category -> (E, observations)
    void set(const std::string& cat, double e) { est[cat] = {e, 0}; }
    bool update(const std::string& cat, double actual) {
        if (actual <= 0 || !est.count(cat)) return false; // ignore missing/invalid outcomes
        auto& e = est[cat];
        e.first = alpha * actual + (1 - alpha) * e.first;
        e.second++;
        return true;
    }
    bool lowConfidence(const std::string& cat) const { auto it = est.find(cat); return it == est.end() || it->second.second < 3; }
};

// ---------- approve / reject session with history ----------
struct Session {
    World world;
    Plan approved;
    std::vector<std::string> log;
    RepairResult pending;
    bool hasPending = false;
    void start(const World& w) { world = w; approved = initialPlan(w); log.push_back("INIT"); }
    const RepairResult& propose(const Disruption& d) {
        pending = repair(approved, world, d);
        hasPending = true;
        log.push_back("PROPOSE " + d.label() + " -> " + pending.best.name);
        return pending;
    }
    void approve() {
        if (!hasPending) return;
        approved = pending.best; world = pending.world; hasPending = false;
        log.push_back("APPROVE");
    }
    void reject(const std::string& reason) { hasPending = false; log.push_back("REJECT " + reason); }
};

// ---------- CSV loading (all-or-nothing) ----------
struct LoadResult { std::vector<Task> tasks; std::vector<std::string> errors; };
inline LoadResult loadTasksCSV(const std::string& path) {
    LoadResult r;
    std::ifstream f(path);
    if (!f) { r.errors.push_back("cannot open file"); return r; }
    std::string line;
    std::getline(f, line); // header
    int ln = 1;
    while (std::getline(f, line)) {
        ++ln;
        if (line.empty()) continue;
        std::vector<std::string> cols;
        std::stringstream ss(line);
        std::string c;
        while (std::getline(ss, c, ',')) cols.push_back(c);
        if (cols.size() != 6) { r.errors.push_back("line " + std::to_string(ln) + ": expected 6 fields"); continue; }
        Task t;
        try {
            t.id = cols[0]; t.title = cols[1];
            t.dur = std::stoi(cols[2]); t.prio = std::stoi(cols[3]); t.deadline = std::stoi(cols[4]);
            t.split = (cols[5] == "1" || cols[5] == "yes");
        } catch (...) { r.errors.push_back("line " + std::to_string(ln) + ": non-numeric field"); continue; }
        r.tasks.push_back(t);
    }
    for (auto& m : validateTasks(r.tasks)) r.errors.push_back(m);
    if (!r.errors.empty()) r.tasks.clear(); // never return partially valid data
    return r;
}

} // namespace adapt
