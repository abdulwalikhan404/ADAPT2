import json, subprocess, os
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

os.chdir("/home/claude/adapt2")
F = "figs"
BLUE, GREY, AMBER, INK, MUTE = "#2563EB", "#94A3B8", "#D97706", "#0F172A", "#64748B"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": MUTE, "axes.labelcolor": INK, "xtick.color": INK, "ytick.color": INK})

# ------------------------------------------------------------------ flowcharts (graphviz)
def dot(name, src):
    open(f"{F}/{name}.dot", "w").write(src)
    subprocess.run(["dot", "-Tpng", "-Gdpi=200", f"{F}/{name}.dot", "-o", f"{F}/{name}.png"], check=True)

HDR = 'graph [fontname="Helvetica", bgcolor="white", pad=0.3]; node [fontname="Helvetica", fontsize=11, shape=box, style="rounded,filled", color="#334155", penwidth=1.2]; edge [fontname="Helvetica", fontsize=9, color="#475569"];'
BUILT = 'fillcolor="#DBEAFE"'
PLAN = 'fillcolor="#FEF3C7", style="rounded,filled,dashed"'

from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
steps = [("1  Upload", "PDF / Word / photo", 0), ("2  Extract text", "parser + OCR", 0), ("3  Notes library", "subject / topic / search", 0), ("4  AI explainer", "summary, simple English/Urdu", 0),
         ("5  Practice", "flashcards + quiz", 0), ("6  Quiz results", "learning indicator", 0), ("7  Revision tasks", "duration, priority, deadline", 0), ("8  ADAPT planner (C++17)", "schedule + constraint check", 1),
         ("9  Disruption", "lost time / new task / longer task", 1), ("10  Selective repair", "+ plain-language explanation", 1), ("11  User decision", "approve or reject", 1), ("12  Actual duration", "update estimator", 1)]
fig, ax = plt.subplots(figsize=(11, 6.2)); ax.set_xlim(-0.12, 4.0); ax.set_ylim(0, 3.2); ax.axis("off")
pos = []
for i in range(12):
    r, c = divmod(i, 4)
    x = (c if r % 2 == 0 else 3 - c) * 1.0 + 0.06; y = 2.35 - r * 1.05
    pos.append((x, y))
for (t, sub, built), (x, y) in zip(steps, pos):
    ax.add_patch(FancyBboxPatch((x, y), 0.88, 0.62, boxstyle="round,pad=0.02,rounding_size=0.06", fc="#DBEAFE" if built else "#FEF3C7", ec=BLUE if built else AMBER, lw=1.6, ls="-" if built else "--"))
    ax.text(x + 0.44, y + 0.40, t, ha="center", va="center", fontsize=9.5, fontweight="bold", color=INK)
    ax.text(x + 0.44, y + 0.17, sub, ha="center", va="center", fontsize=7.6, color=MUTE, wrap=True)
def arrow(a, b, **kw):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=12, color=MUTE, lw=1.2, **kw))
for i in range(11):
    (x1, y1), (x2, y2) = pos[i], pos[i + 1]
    if y1 == y2:
        if x2 > x1: arrow((x1 + 0.91, y1 + 0.31), (x2 - 0.03, y2 + 0.31))
        else: arrow((x1 - 0.03, y1 + 0.31), (x2 + 0.91, y2 + 0.31))
    else:
        arrow((x1 + 0.44, y1 - 0.03), (x2 + 0.44, y2 + 0.65))
bx, by = pos[11][0] + 0.44, pos[11][1]
ax.plot([bx, bx, -0.06, -0.06], [by - 0.03, 0.14, 0.14, pos[7][1] + 0.31], color=BLUE, lw=1.2, ls=":")
arrow((-0.06, pos[7][1] + 0.28), (pos[7][0] - 0.03, pos[7][1] + 0.31))
ax.text(2.0, 0.05, "updated duration estimates feed the next plan (step 8)", fontsize=8, color=BLUE, ha="center", style="italic")
ax.add_patch(FancyBboxPatch((0.06, 3.05), 0.12, 0.08, boxstyle="round,pad=0.01", fc="#DBEAFE", ec=BLUE, lw=1.4)); ax.text(0.22, 3.09, "built and tested (Stage 1)", fontsize=8.5, va="center")
ax.add_patch(FancyBboxPatch((1.3, 3.05), 0.12, 0.08, boxstyle="round,pad=0.01", fc="#FEF3C7", ec=AMBER, lw=1.4, ls="--")); ax.text(1.46, 3.09, "planned (Stages 2-5)", fontsize=8.5, va="center")
plt.tight_layout(); plt.savefig(f"{F}/fig1_pipeline.png", dpi=200); plt.close()

dot("fig2_architecture", f"""digraph G {{ rankdir=TB; {HDR} nodesep=0.3; ranksep=0.5; compound=true;
 ui [label="Student interface\\n(CLI now; HTML/CSS/JS later)", {PLAN}];
 api [label="Application backend / web API", {PLAN}];
 subgraph cluster_core {{ label="C++17 ADAPT engine (Stage 1 - implemented)"; style="rounded,filled"; fillcolor="#EFF6FF"; color="#2563EB"; fontsize=11;
   {{rank=same; val; sch; adp; sco}} {{rank=same; exp; ses; est}}
   val [label="Validation", {BUILT}]; sch [label="Scheduler\\n(EDF + priority)", {BUILT}]; adp [label="Adaptation engine\\n(selective repair)", {BUILT}];
   sco [label="Scorer", {BUILT}]; exp [label="Explainer", {BUILT}]; est [label="Estimator\\n(EMA)", {BUILT}]; ses [label="Session / history\\napprove-reject", {BUILT}]; }}
 db [label="Storage\\nCSV now -> SQLite later", {PLAN}];
 ocr [label="Document parsers + OCR", {PLAN}]; ai [label="AI model\\n(explain / quiz)", {PLAN}]; sim [label="Similarity + citation\\nchecker", {PLAN}];
 ui->api; api->val [lhead=cluster_core]; val->sch->adp->sco->exp->ses->est; api->db; api->ocr; api->ai; api->sim;
}}""")

dot("fig3_repair_flow", f"""digraph G {{ rankdir=TB; {HDR} nodesep=0.35; ranksep=0.4;
 s [label="Disruption reported", shape=oval, {BUILT}];
 a [label="Apply to world:\\nremove lost time / add task / change duration", {BUILT}];
 b [label="Find affected tasks\\n(overlap, changed duration, new task)", {BUILT}];
 c [label="C1 Selective: freeze all unaffected tasks,\\nre-place affected ones (EDF > priority > shorter)", {BUILT}];
 d [label="Did the disruption leave a NEW\\ntask unscheduled?", shape=diamond, style="filled", fillcolor="#FFFFFF", fontsize=10];
 e [label="C2 Expanded: also let later-deadline\\ntasks move\\nC3 Full reschedule (last resort)", {BUILT}];
 f [label="Hard-constraint check\\n(no overlap, inside free time, before deadline,\\nfull duration, no split of non-splittable)", {BUILT}];
 g [label="Reject candidates with violations;\\nscore the rest:\\ncost = 200 x unscheduled priority + 3 x unnecessary moves + 1 x moved tasks", {BUILT}];
 h [label="Pick lowest cost; write a reason\\nfor every moved / unscheduled task", {BUILT}];
 i [label="Show proposal to user", {BUILT}];
 j [label="Approve?", shape=diamond, style="filled", fillcolor="#FFFFFF"];
 k [label="Store as approved plan\\n+ history", shape=oval, {BUILT}]; l [label="Keep previous plan\\nlog rejection", shape=oval, {BUILT}];
 s->a->b->c->d; d->f [label="no"]; d->e [label="yes"]; e->f; f->g->h->i->j; j->k [label="yes"]; j->l [label="no"];
}}""")

dot("fig4_loop", f"""digraph G {{ rankdir=LR; {HDR} node [shape=circle, width=1.15, fixedsize=true, fontsize=11, style=filled, {BUILT}]; nodesep=0.5;
 P [label="PLAN"]; O [label="OBSERVE"]; D [label="DIAGNOSE"]; R [label="REPAIR"]; L [label="LEARN"];
 P->O->D->R->L; L->P [label="  updated estimates"];
}}""")

# ------------------------------------------------------------------ roadmap
fig, ax = plt.subplots(figsize=(9, 3.4))
stages = [("Stage 1  Core planner (C++17)", 0, 10, BLUE, "implemented + tested"),
          ("Stage 2  Notes library + OCR", 10, 18, AMBER, "planned"),
          ("Stage 3  AI explainer + quizzes", 18, 26, AMBER, "planned"),
          ("Stage 4  Originality tools", 26, 32, AMBER, "planned"),
          ("Stage 5  Low-bandwidth / Urdu / evaluation", 32, 38, AMBER, "planned")]
for i, (n, s, e, c, t) in enumerate(stages):
    ax.barh(len(stages) - 1 - i, e - s, left=s, color=c, height=0.55)
    ax.text(s + 0.3, len(stages) - 1 - i, t, va="center", color="white", fontsize=8.5, fontweight="bold")
ax.set_yticks(range(len(stages))); ax.set_yticklabels([s[0] for s in stages][::-1])
ax.set_xlabel("Suggested timeline (weeks, indicative)"); ax.set_xlim(0, 40)
ax.set_title("ADAPT 2.0 staged roadmap", loc="left", fontweight="bold")
plt.tight_layout(); plt.savefig(f"{F}/fig5_roadmap.png", dpi=200); plt.close()

# ------------------------------------------------------------------ worked example (Gantt)
d = pd.read_csv("results/demo_schedules.csv")
titles = {"before": "Before disruption", "adapt": "ADAPT selective repair", "fixed": "Baseline A: fixed plan", "full": "Baseline B: full reschedule"}
cols = {"A01": "#2563EB", "A02": "#0D9488", "A03": "#7C3AED", "A04": "#D97706", "A05": "#DB2777"}
fig, axs = plt.subplots(4, 1, figsize=(10.5, 6.6), sharex=True)
for ax, k in zip(axs, ["before", "adapt", "fixed", "full"]):
    s = d[d.plan == k]
    for _, r in s.dropna().iterrows():
        ax.barh(0, r.end - r.start, left=r.start, color=cols[r.task], edgecolor="white", height=0.6, zorder=3)
        ax.text((r.start + r.end) / 2, 0, r.task, ha="center", va="center", color="white", fontsize=8, fontweight="bold", zorder=4)
    un = s[s.start.isna()].task.tolist()
    ax.axvspan(960, 1080, color="#FECACA", alpha=0.6, lw=0, zorder=0)
    ax.axvspan(1140, 1200, color="#E2E8F0", lw=0, zorder=0)
    ax.set_yticks([]); ax.set_ylabel(titles[k], rotation=0, ha="right", va="center", fontsize=9)
    ax.text(1425, 0, ("Unscheduled: " + ", ".join(un)) if un else "All scheduled", ha="right", va="center", fontsize=8.5, color="#B91C1C" if un else "#15803D")
    ax.spines["left"].set_visible(False)
axs[-1].set_xticks(range(960, 1441, 60)); axs[-1].set_xticklabels([f"{m//60:02d}:00" for m in range(960, 1441, 60)])
axs[-1].set_xlim(950, 1440)
fig.suptitle("Worked example: Mon 16:00-18:00 lost (red band); grey band = fixed commitment 19:00-20:00", x=0.01, ha="left", fontsize=10, fontweight="bold")
fig.subplots_adjust(left=0.26, right=0.98, top=0.92, bottom=0.07, hspace=0.35)
plt.savefig(f"{F}/fig6_worked_example.png", dpi=200); plt.close()

# ------------------------------------------------------------------ benchmark charts
b = pd.read_csv("results/benchmark.csv")
main = b[b.w_unsched == 200]
names = {"fixed_plan": "Fixed plan", "full_reschedule": "Full reschedule", "adapt_selective": "ADAPT selective"}
colr = {"fixed_plan": GREY, "full_reschedule": AMBER, "adapt_selective": BLUE}
order = ["fixed_plan", "full_reschedule", "adapt_selective"]
loads = [8, 14, 20]

def ci(x):
    return 1.96 * x.std(ddof=1) / np.sqrt(len(x))

fig, axs = plt.subplots(1, 3, figsize=(11, 3.7))
for ax, (col, ttl, scale) in zip(axs, [("all_scheduled", "Scenarios with every task scheduled (%)", 100), ("unsched_weight", "Unscheduled priority points (lower = better)", 1), ("unnecessary_moves", "Unaffected tasks moved (lower = better)", 1)]):
    w = 0.26
    for j, m in enumerate(order):
        vals = [main[(main.method == m) & (main.load_tasks == n)][col] for n in loads]
        ax.bar(np.arange(3) + (j - 1) * w, [v.mean() * scale for v in vals], w, yerr=[ci(v) * scale for v in vals], color=colr[m], label=names[m], capsize=2, ecolor=INK, error_kw={"lw": 0.8})
    ax.set_xticks(range(3)); ax.set_xticklabels([f"{n} tasks" for n in loads]); ax.set_title(ttl, fontsize=9.5, loc="left")
axs[0].legend(frameon=False, fontsize=8, loc="upper right")
fig.suptitle("Benchmark: 900 random scenarios, 300 per load level (bars = mean, whiskers = 95% CI)", x=0.01, ha="left", fontsize=10, fontweight="bold")
plt.tight_layout(rect=(0, 0, 1, 0.93)); plt.savefig(f"{F}/fig7_benchmark.png", dpi=200); plt.close()

# by disruption type
fig, ax = plt.subplots(figsize=(7.5, 3.5))
types = ["lost_window", "new_task", "duration_change"]
for j, m in enumerate(["full_reschedule", "adapt_selective"]):
    vals = [main[(main.method == m) & (main.disruption == t)].unnecessary_moves for t in types]
    ax.bar(np.arange(3) + (j - 0.5) * 0.35, [v.mean() for v in vals], 0.35, yerr=[ci(v) for v in vals], color=colr[m], label=names[m], capsize=2, ecolor=INK, error_kw={"lw": 0.8})
ax.set_xticks(range(3)); ax.set_xticklabels(["Lost window", "New urgent task", "Task takes longer"])
ax.set_ylabel("Unaffected tasks moved (mean)"); ax.legend(frameon=False); ax.set_title("Unnecessary moves by disruption type (300 scenarios each)", loc="left", fontsize=10, fontweight="bold")
plt.tight_layout(); plt.savefig(f"{F}/fig8_by_disruption.png", dpi=200); plt.close()

# weight sweep
sw = b[b.method == "adapt_selective"].groupby("w_unsched").agg(done=("all_scheduled", "mean"), unn=("unnecessary_moves", "mean"), unw=("unsched_weight", "mean")).reset_index()
fullm = b[(b.method == "full_reschedule") & (b.w_unsched == 200)]
fig, axs = plt.subplots(1, 2, figsize=(9.5, 3.6))
axs[0].plot(sw.unn, sw.unw, "-o", color=BLUE)
for _, r in sw.iterrows(): axs[0].annotate(f"w={int(r.w_unsched)}", (r.unn, r.unw), textcoords="offset points", xytext=(6, 4), fontsize=8)
axs[0].scatter([fullm.unnecessary_moves.mean()], [fullm.unsched_weight.mean()], color=AMBER, zorder=3, label="Full reschedule")
axs[0].set_xlabel("Unaffected tasks moved (mean)"); axs[0].set_ylabel("Unscheduled priority points (mean)"); axs[0].legend(frameon=False)
axs[0].set_title("Stability vs completeness", loc="left", fontsize=10, fontweight="bold")
axs[1].plot(sw.w_unsched, sw.done * 100, "-o", color=BLUE); axs[1].axhline(fullm.all_scheduled.mean() * 100, color=AMBER, ls="--", label="Full reschedule")
axs[1].set_xscale("log"); axs[1].set_xlabel("Weight on unscheduled priority (log scale)"); axs[1].set_ylabel("Scenarios fully scheduled (%)"); axs[1].legend(frameon=False)
axs[1].set_title("Effect of the cost weight", loc="left", fontsize=10, fontweight="bold")
plt.tight_layout(); plt.savefig(f"{F}/fig9_weight_sweep.png", dpi=200); plt.close()

# runtime
sc = pd.read_csv("results/scale.csv")
fig, ax = plt.subplots(figsize=(7, 3.5))
ax.plot(sc.tasks, sc.repair_adapt_us_median / 1000, "-o", color=BLUE, label="ADAPT repair")
ax.plot(sc.tasks, sc.full_reschedule_us_median / 1000, "-o", color=AMBER, label="Full reschedule")
ax.axhline(2000, color="#DC2626", ls=":", label="NFR-04 target: 2 s at 100 tasks")
ax.set_yscale("log"); ax.set_xlabel("Number of tasks"); ax.set_ylabel("Median runtime (ms, log scale)"); ax.legend(frameon=False, fontsize=8)
ax.set_title("Runtime scaling (median of 21 runs per size)", loc="left", fontsize=10, fontweight="bold")
plt.tight_layout(); plt.savefig(f"{F}/fig10_runtime.png", dpi=200); plt.close()

# ------------------------------------------------------------------ stats for the documents
p = main.pivot_table(index="scenario", columns="method", values="unnecessary_moves")
p["load"] = main[main.method == "full_reschedule"].set_index("scenario").load_tasks
diff = p.full_reschedule - p.adapt_selective
q = main.pivot_table(index="scenario", columns="method", values="unsched_weight")
v0 = pd.read_csv("results/benchmark_v0.1_defect.csv")
stats = {
    "n": int(main.scenario.nunique()),
    "mean": {m: {"all_scheduled": float(main[main.method == m].all_scheduled.mean()), "scheduled": float(main[main.method == m].scheduled.mean()),
                 "total": float(main[main.method == m].total_tasks.mean()), "unsched_weight": float(main[main.method == m].unsched_weight.mean()),
                 "disruption": float(main[main.method == m].disruption_count.mean()), "unnecessary": float(main[main.method == m].unnecessary_moves.mean()),
                 "violations": float(main[main.method == m].violations.sum()), "runtime_us": float(main[main.method == m].runtime_us.mean())} for m in order},
    "by_load": {str(n): {m: {"all_scheduled": float(main[(main.method == m) & (main.load_tasks == n)].all_scheduled.mean()),
                              "unsched_weight": float(main[(main.method == m) & (main.load_tasks == n)].unsched_weight.mean()),
                              "unnecessary": float(main[(main.method == m) & (main.load_tasks == n)].unnecessary_moves.mean())} for m in order} for n in loads},
    "by_type": {t: {m: float(main[(main.method == m) & (main.disruption == t)].unnecessary_moves.mean()) for m in order} for t in types},
    "unnec_diff_mean": float(diff.mean()), "unnec_diff_ci": float(ci(diff)),
    "adapt_fewer_moves_pct": float((diff > 0).mean() * 100), "adapt_equal_moves_pct": float((diff == 0).mean() * 100), "adapt_more_moves_pct": float((diff < 0).mean() * 100),
    "adapt_more_unsched_than_full_pct": float((q.adapt_selective > q.full_reschedule).mean() * 100),
    "adapt_less_unsched_than_full_pct": float((q.adapt_selective < q.full_reschedule).mean() * 100),
    "strategy_share": main[main.method == "adapt_selective"].strategy.value_counts(normalize=True).round(3).to_dict(),
    "sweep": sw.round(3).to_dict(orient="records"),
    "v0_unnec_adapt": float(v0[v0.method == "adapt_selective"].unnecessary_moves.mean()),
    "scale": sc.to_dict(orient="records"),
    "total_violations": int(b.violations.sum()), "rows": int(len(b)),
}
json.dump(stats, open("results/summary_stats.json", "w"), indent=1)
print(json.dumps({k: stats[k] for k in ["unnec_diff_mean", "unnec_diff_ci", "adapt_fewer_moves_pct", "adapt_equal_moves_pct", "adapt_more_moves_pct", "adapt_more_unsched_than_full_pct", "adapt_less_unsched_than_full_pct", "strategy_share", "total_violations"]}, indent=1))
print(stats["by_type"]); print(stats["by_load"])
