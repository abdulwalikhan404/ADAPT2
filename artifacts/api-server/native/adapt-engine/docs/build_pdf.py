import sys
sys.path.insert(0, "/home/claude/adapt2/docs")
from content import *
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
from PIL import Image as PI

BLUE, INK, MUTE, LIGHT = colors.HexColor("#2563EB"), colors.HexColor("#0F172A"), colors.HexColor("#64748B"), colors.HexColor("#F1F5F9")
W = A4[0] - 36 * mm
st = {
    "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=INK, spaceAfter=6),
    "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=12.5, leading=17, textColor=MUTE, spaceAfter=4),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=BLUE, spaceBefore=8, spaceAfter=3),
    "p": ParagraphStyle("p", fontName="Helvetica", fontSize=9.6, leading=13.6, textColor=INK, spaceAfter=5),
    "cap": ParagraphStyle("c", fontName="Helvetica-Oblique", fontSize=8.3, leading=11, textColor=MUTE, spaceAfter=8),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=10, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white),
    "note": ParagraphStyle("n", fontName="Helvetica", fontSize=9, leading=12.5, textColor=INK, backColor=colors.HexColor("#FEF3C7"), borderPadding=(6, 6, 6, 6), spaceBefore=4, spaceAfter=10),
    "good": ParagraphStyle("g", fontName="Helvetica", fontSize=9, leading=12.5, textColor=INK, backColor=colors.HexColor("#DBEAFE"), borderPadding=(6, 6, 6, 6), spaceBefore=4, spaceAfter=10),
}
E = []
P = lambda t, s="p": E.append(Paragraph(t, st[s]))
def H1(t): P(escape(t), "h1")
def H2(t): P(escape(t), "h2")
def bullets(items):
    for i in items: E.append(Paragraph("&bull;&nbsp;&nbsp;" + i, ParagraphStyle("b", parent=st["p"], leftIndent=12, firstLineIndent=-10, spaceAfter=2)))
    E.append(Spacer(1, 4))
def fig(path, cap, width=1.0):
    w, h = PI.open(path).size
    ww = W * width
    E.append(KeepTogether([Image(path, ww, ww * h / w), Paragraph(cap, st["cap"])]))
def table(head, rows, widths=None, small=False):
    fs = ParagraphStyle("c2", parent=st["cell"], fontSize=7 if small else 8, leading=9 if small else 10)
    fh = ParagraphStyle("h2c", parent=st["cellb"], fontSize=7 if small else 8, leading=9 if small else 10)
    data = [[Paragraph(escape(str(h)), fh) for h in head]] + [[Paragraph(escape(str(c)), fs) for c in r] for r in rows]
    t = Table(data, colWidths=[W * x for x in widths] if widths else None, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), BLUE), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    E.append(t); E.append(Spacer(1, 8))

def footer(c, d):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(MUTE)
    c.drawString(18 * mm, 10 * mm, "ADAPT 2.0 - Workflow, diagrams, testing and results"); c.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {d.page}"); c.restoreState()

d = S["unnec_diff_mean"]; dci = S["unnec_diff_ci"]
# ----------------------------------------------------------------- cover
E.append(Spacer(1, 30 * mm))
P("ADAPT 2.0", "title")
P("AI-Powered Adaptive Student Learning and Support Platform", "sub")
P("Workflow pipeline, flowcharts, test data and measured results", "sub")
E.append(Spacer(1, 6 * mm))
P(f"Document date: {TODAY}. Companion to the ADAPT 2.0 Word documentation.", "p")
P("<b>What is real in this document.</b> Stage 1, the C++17 planning engine, was implemented and tested for this document. All test results, charts and timings come from that engine "
  f"({PASSED} of {len(TESTS)} planned tests, plus {S['n']} randomised benchmark scenarios) and can be reproduced from the files in the project folder. "
  "Stages 2 to 5 (notes library, OCR, AI explanations, quizzes, originality tools, Urdu and low-bandwidth support) are <b>designed but not built</b>: they appear in the diagrams and test plans, and no results are reported for them.", "good")
P(f"Test environment: {ESC}." if False else f"Test environment: {escape(ENV)}. Timings are from this machine, not from a student laptop.", "p")

# ----------------------------------------------------------------- 1 workflow
H1("1. End-to-end workflow pipeline")
P("A student uploads notes, ADAPT reads and explains them, the student practises, and weak topics turn into revision tasks that the C++ planner schedules and repairs when real life changes. "
  "Blue steps exist and are tested; amber dashed steps are planned.")
fig("figs/fig1_pipeline.png", "Figure 1. ADAPT 2.0 workflow. The loop from step 12 back to step 8 is how duration estimates improve later plans.")
table(STEPS_H, STEPS, [0.04, 0.14, 0.44, 0.17, 0.21])

H1("2. System architecture")
P("The C++ engine owns scheduling, constraint checking and repair. Language, OCR and similarity tools sit around it and talk to it through the backend, so the core planner keeps working even when an external AI service is down.")
fig("figs/fig2_architecture.png", "Figure 2. Proposed architecture. Blue: implemented in Stage 1. Amber dashed: planned.")
table(MODULES_H, MODULES, [0.22, 0.56, 0.22])
fig("figs/fig4_loop.png", "Figure 3. The Plan - Observe - Diagnose - Repair - Learn loop.", 0.7)

H1("3. Repair algorithm flowchart")
P("When a disruption arrives, ADAPT first tries to move only the affected tasks. It widens the search only if the disruption leaves a task unscheduled that was scheduled before. Candidates that break a hard constraint are discarded, and the rest are compared with one cost function.")
fig("figs/fig3_repair_flow.png", "Figure 4. Selective repair with approval. Hard constraints: no overlap, inside free time, before deadline, full duration, non-splittable tasks stay in one piece.", 0.78)
P(f"<b>Cost function.</b> {escape(COSTFORM)}. Deadlines are hard: a task that cannot finish before its deadline is reported as unscheduled, never silently placed late. "
  "The weights are design choices; section 7.3 shows how changing them trades completeness against stability.", "note")

H1("4. Worked example")
P("Data are the five fictional tasks from the original proposal (Appendix B), with study windows 16:00 to 22:00 on Monday to Thursday and a fixed commitment on Monday 19:00 to 20:00. The disruption removes Monday 16:00 to 18:00.")
table(SAMPLE_H, SAMPLE, [0.08, 0.28, 0.16, 0.12, 0.22, 0.14])
fig("figs/fig6_worked_example.png", "Figure 5. The same disruption handled by ADAPT and the two baselines (output of the real engine).")
table(EXAMPLE_H, EXAMPLE, [0.26, 0.2, 0.18, 0.16, 0.2])
P("A01 has a Monday 18:00 deadline, so it cannot be rescheduled once 16:00 to 18:00 is gone. ADAPT says so instead of pretending it fits. It leaves A04 and A05 exactly where they were; the full reschedule moves both for no benefit to the student. Engine explanations for this run:", "p")
bullets(["A01 cannot be scheduled before its deadline (directly affected by the disruption)", "A02 moved to Mon 21:45 (directly affected by the disruption)", "A03 moved to Mon 18:00 (directly affected by the disruption)"])

H1("5. Roadmap")
fig("figs/fig5_roadmap.png", "Figure 6. Staged plan. Only Stage 1 is built; week counts are indicative and should be fitted to the course calendar.", 0.85)

# ----------------------------------------------------------------- testing
E.append(PageBreak())
H1("6. Test method")
bullets(["<b>Unit-style scenario tests (T1 to T10)</b> from the original proposal's test matrix, run on the demo data above.",
         f"<b>Randomised benchmark</b>: {S['n']} scenarios = 3 load levels (8, 14, 20 tasks) x 3 disruption types (lost window, urgent new task, task takes longer) x 100 random seeds (generator seed 2026). 4-day horizon; study windows 09:00-12:00 and 16:00-22:00; about half the days have a 60-minute fixed commitment; task length 30-120 min; priority 1-5; 60% splittable.",
         "<b>Disruptions are targeted</b>: lost windows and longer tasks are applied to a task that is actually scheduled, so every scenario exercises the repair logic.",
         "<b>Methods compared on identical inputs</b>: A fixed plan (affected tasks are dropped, nothing is repaired), B full reschedule (rebuild everything with the same heuristic), ADAPT selective repair.",
         "<b>Metrics</b>: share of scenarios with every task scheduled; unscheduled priority points (sum of priorities of tasks left unscheduled); previously scheduled tasks whose time changed; unaffected tasks moved; hard-constraint violations (checked independently of the planner); runtime.",
         f"<b>Scale test</b>: 25 to 400 tasks over 40 days, median of 21 runs per size, against the proposal's target of 100 tasks in under 2 seconds."])

H1("7. Results")
H2("7.1 Scenario tests T1 to T10")
table(TEST_H, TEST_ROWS, [0.06, 0.26, 0.56, 0.12])
P(f"<b>{PASSED} of {len(TESTS)} passed.</b> These are functional checks on one demo dataset. They show the required behaviours exist; they do not show performance in general.", "p")

H2("7.2 Benchmark: all three methods")
table(OVERALL[0], OVERALL[1], [0.2, 0.12, 0.14, 0.15, 0.12, 0.14, 0.13])
fig("figs/fig7_benchmark.png", "Figure 7. Results by load level (900 scenarios). Whiskers are 95% confidence intervals of the mean.")
table(BYLOAD_H, BYLOAD, [0.14, 0.2, 0.22, 0.22, 0.22])
fig("figs/fig8_by_disruption.png", "Figure 8. Unaffected tasks moved, by disruption type.", 0.72)
table(BYTYPE_H, BYTYPE, [0.4, 0.3, 0.3])
P(f"<b>Main finding.</b> ADAPT completed exactly as many scenarios as the full rescheduler ({pct(M['adapt_selective']['all_scheduled'])}) and left slightly fewer priority points unscheduled "
  f"({f2(M['adapt_selective']['unsched_weight'])} vs {f2(M['full_reschedule']['unsched_weight'])}), while moving {f2(d)} fewer unaffected tasks per scenario (95% CI +/- {f2(dci)}; "
  f"{M['full_reschedule']['unnecessary']:.2f} vs {M['adapt_selective']['unnecessary']:.2f}). ADAPT moved fewer unaffected tasks in {S['adapt_fewer_moves_pct']:.0f}% of scenarios and the same number in {S['adapt_equal_moves_pct']:.0f}%; it never moved more. "
  f"Hard-constraint violations across all {S['rows']:,} method runs: {S['total_violations']}.", "good")

H2("7.3 Choosing the cost weights")
P("The weight on unscheduled priority was swept while everything else was held fixed. Lower weights make ADAPT more conservative: fewer unaffected tasks move, but more work is left unscheduled.")
fig("figs/fig9_weight_sweep.png", "Figure 9. Stability versus completeness as the weight changes.", 0.92)
table(SWEEP_H, SWEEP, [0.3, 0.2, 0.25, 0.25])
P("The default (200) behaves like the full rescheduler on completeness. A weight near 20 keeps most of the completeness (52% vs 55% fully scheduled) while moving about 19% fewer unaffected tasks than the default. Which point is right depends on how much a student values stability over squeezing in the last task; the choice should be tested with users.", "p")

H2("7.4 Runtime")
fig("figs/fig10_runtime.png", "Figure 10. Median repair time versus number of tasks.", 0.72)
table(SCALE_H, SCALE, [0.3, 0.35, 0.35])
P("The 100-task target (under 2 seconds) is met by a wide margin: about 0.6 ms. ADAPT is slower than a plain rebuild because it evaluates several candidates, but even at 400 tasks it takes a few milliseconds.", "p")

H2("7.5 Raw data sample")
P("First two scenarios of the benchmark (default weights). Full data: results/benchmark.csv (13,500 rows).", "p")
table(RAW_H, RAW_T, [0.09, 0.06, 0.12, 0.14, 0.09, 0.1, 0.08, 0.08, 0.1, 0.06, 0.08], small=True)

H1("8. Defect found by testing")
P(f"The first benchmark run showed ADAPT moving {f2(S['v0_unnec_adapt'])} unaffected tasks per scenario, far more than expected. The suspected cause was that ADAPT escalated to wider candidates even when the unscheduled tasks were already unscheduled before the disruption. "
  "The trigger was changed to react only to newly unscheduled tasks, but the result barely changed (4.01 to 4.00). The real cause was the cost function: with 200 points per unscheduled priority point and 3 per unnecessary move, ADAPT will reshuffle many tasks to rescue one. "
  "That is a modelling choice, not a bug, which is why section 7.3 sweeps the weight. The first run is kept as results/benchmark_v0.1_defect.csv.", "p")

H1("9. Limits of these results")
bullets(["<b>Synthetic scenarios.</b> They come from one random generator. Real student timetables may behave differently; the planned user pilot is the real test.",
         "<b>ADAPT includes the full reschedule as a fallback candidate.</b> So it cannot leave more priority points unscheduled than the full reschedule by construction. The meaningful comparison is the number of unaffected tasks moved.",
         "<b>Baseline A is deliberately weak.</b> It drops affected tasks without trying to repair them. Its main use is to show the cost of doing nothing.",
         "<b>Timings are from a cloud container</b>, not a student's laptop.",
         "<b>Only Stage 1 is tested.</b> Nothing here says whether OCR, AI explanations, quizzes or originality tools will work well."])

H1("10. Test plans for Stages 2 to 5 (not yet run)")
P("These tables are blank on purpose. Fill the last column only with measured results after each stage is built.")
for nm, (h, r) in [("Stage 2 - Notes library and OCR", S2), ("Stage 3 - AI explainer and quizzes", S3), ("Stage 4 - Originality tools", S4), ("Stage 5 - Accessibility and pilot", S5)]:
    H2(nm); table(h, r, [0.08, 0.34, 0.38, 0.2])

H1("11. Reproducing these results")
P("All code is C++17 with the standard library only; charts use Python (matplotlib, Graphviz).", "p")
for c in ["g++ -std=c++17 -O2 -o run_tests tests/run_tests.cpp &amp;&amp; ./run_tests", "g++ -std=c++17 -O2 -o bench tests/bench.cpp &amp;&amp; ./bench", "g++ -std=c++17 -O2 -o demo tests/demo.cpp &amp;&amp; ./demo", "python3 docs/make_figs.py"]:
    E.append(Paragraph(c, ParagraphStyle("code", fontName="Courier", fontSize=8.5, leading=12, backColor=LIGHT, borderPadding=(3, 3, 3, 3), spaceAfter=5)))

SimpleDocTemplate("ADAPT_2.0_Workflow_Diagrams_and_Test_Results.pdf", pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                  title="ADAPT 2.0 - Workflow, diagrams, testing and results", author="ADAPT project").build(E, onFirstPage=lambda c, d: None, onLaterPages=footer)
print("pdf ok")
