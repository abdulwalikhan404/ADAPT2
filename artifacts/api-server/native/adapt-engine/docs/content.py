"""Shared content for the ADAPT 2.0 PDF and Word documents. Every number is read from results/*.csv|json."""
import csv, json, os
os.chdir("/home/claude/adapt2")
S = json.load(open("results/summary_stats.json"))
M = S["mean"]
TESTS = list(csv.DictReader(open("results/test_results.csv")))
ENV = "Ubuntu 24.04, g++ 13.3.0 (-std=c++17 -O2), 2 CPU cores, cloud container"
TODAY = "11 October 2026"
f1 = lambda x: f"{x:.1f}"
f2 = lambda x: f"{x:.2f}"
pct = lambda x: f"{x*100:.0f}%"

def mrow(name, k):
    m = M[k]
    return [name, pct(m["all_scheduled"]), f1(m["scheduled"]) + " / " + f1(m["total"]), f2(m["unsched_weight"]), f2(m["disruption"]), f2(m["unnecessary"]), str(int(m["violations"]))]

OVERALL = (["Method", "All tasks scheduled", "Tasks scheduled (mean)", "Unscheduled priority points", "Tasks changed", "Unaffected tasks moved", "Hard violations"],
           [mrow("A  Fixed plan", "fixed_plan"), mrow("B  Full reschedule", "full_reschedule"), mrow("ADAPT selective repair", "adapt_selective")])

BYLOAD_H = ["Load", "Method", "All scheduled", "Unscheduled points", "Unaffected moved"]
BYLOAD = []
for n in ["8", "14", "20"]:
    for k, nm in [("fixed_plan", "A  Fixed"), ("full_reschedule", "B  Full"), ("adapt_selective", "ADAPT")]:
        d = S["by_load"][n][k]
        BYLOAD.append([f"{n} tasks", nm, pct(d["all_scheduled"]), f2(d["unsched_weight"]), f2(d["unnecessary"])])

SWEEP_H = ["Weight on unscheduled priority", "All scheduled", "Unscheduled points", "Unaffected moved"]
SWEEP = [[("%d (default)" % r["w_unsched"]) if r["w_unsched"] == 200 else str(int(r["w_unsched"])), pct(r["done"]), f2(r["unw"]), f2(r["unn"])] for r in S["sweep"][::-1]]
SCALE_H = ["Tasks", "ADAPT repair, median (ms)", "Full reschedule, median (ms)"]
SCALE = [[str(r["tasks"]), f2(r["repair_adapt_us_median"] / 1000), f2(r["full_reschedule_us_median"] / 1000)] for r in S["scale"]]
BYTYPE_H = ["Disruption type", "B  Full reschedule", "ADAPT"]
BYTYPE = [[n, f2(S["by_type"][k]["full_reschedule"]), f2(S["by_type"][k]["adapt_selective"])] for k, n in [("lost_window", "Lost study window"), ("new_task", "Urgent new task"), ("duration_change", "Task takes longer")]]
TEST_H = ["ID", "Scenario", "Actual output (measured)", "Result"]
TEST_ROWS = [[t["test_id"], t["scenario"], t["actual_output"], t["result"]] for t in TESTS]
PASSED = sum(t["result"] == "PASS" for t in TESTS)

RAW = list(csv.DictReader(open("results/benchmark.csv")))
RAW_ROWS = [r for r in RAW if r["w_unsched"] == "200" and r["scenario"] in ("0", "1")]
RAW_H = ["scen.", "load", "disruption", "method", "strategy", "scheduled/total", "unsched pts", "changed", "unnecessary", "viol.", "us"]
RAW_T = [[r["scenario"], r["load_tasks"], r["disruption"], r["method"], r["strategy"], f'{r["scheduled"]}/{r["total_tasks"]}', r["unsched_weight"], r["disruption_count"], r["unnecessary_moves"], r["violations"], r["runtime_us"]] for r in RAW_ROWS]

SAMPLE_H = ["id", "title", "duration (min)", "priority", "deadline", "splittable"]
SAMPLE = [["A01", "AI quiz revision", "60", "5", "Mon 18:00", "No"], ["A02", "OOP practice", "60", "4", "Tue 20:00", "Yes"], ["A03", "Math revision", "45", "5", "Mon 21:00", "Yes"],
          ["A04", "English reading", "30", "2", "Wed 19:00", "Yes"], ["A05", "Lab report", "90", "4", "Thu 17:00", "Yes"]]

STEPS_H = ["#", "Step", "What happens", "Owner", "Status"]
STEPS = [["1", "Upload", "Student adds a PDF, Word file or photo of notes", "Web interface", "Planned (Stage 2)"],
         ["2", "Extract text", "Parser or OCR reads the file; unclear regions are flagged, not guessed", "Parser + OCR", "Planned (Stage 2)"],
         ["3", "Notes library", "Notes organised by subject, semester and topic; full-text search", "Backend + database", "Planned (Stage 2)"],
         ["4", "AI explainer", "Summary, key terms and simple-English explanation tied to source passages", "AI model", "Planned (Stage 3)"],
         ["5", "Practice", "Flashcards and a short quiz generated from the notes", "AI model", "Planned (Stage 3)"],
         ["6", "Quiz results", "Scores are treated as a learning indicator, not a measure of understanding", "Backend", "Planned (Stage 3)"],
         ["7", "Revision tasks", "Weak topics become tasks with duration, priority and deadline", "Backend", "Planned (Stage 3)"],
         ["8", "Plan", "Tasks are scheduled around fixed commitments and deadlines", "C++ engine", "Implemented + tested"],
         ["9", "Disruption", "Lost time, a new urgent task or a longer-than-expected task", "C++ engine", "Implemented + tested"],
         ["10", "Selective repair", "Only affected tasks move; every change gets a reason", "C++ engine", "Implemented + tested"],
         ["11", "User decision", "Approve or reject; rejection keeps the old plan and is logged", "C++ engine", "Implemented + tested"],
         ["12", "Actual duration", "Estimator is updated with planned vs actual time", "C++ engine", "Implemented + tested"]]

MODULES_H = ["Module", "Responsibility", "Status"]
MODULES = [["Validation", "Rejects malformed tasks; all-or-nothing CSV loading", "Implemented"], ["Scheduler", "Earliest deadline first, then priority, then shorter task", "Implemented"],
           ["Adaptation engine", "Finds affected tasks, builds selective / expanded / full candidates", "Implemented"], ["Scorer", "Checks hard constraints and computes the cost", "Implemented"],
           ["Explainer", "Plain-language reason for every moved or unscheduled task", "Implemented"], ["Session and history", "Approve / reject, audit log", "Implemented"],
           ["Estimator", "Exponential moving average of task durations", "Implemented"], ["Storage", "CSV now; SQLite later", "CSV implemented; SQLite planned"],
           ["Interface", "Command-line now; web interface later", "Planned"], ["Notes library + OCR", "Upload, extract, organise, search", "Planned"], ["AI explainer + quiz", "Explanations, flashcards, quizzes", "Planned"],
           ["Originality tools", "Similarity check, citation help, advisory AI-writing indicator", "Planned"]]

EXAMPLE_H = ["Method", "Scheduled", "Unscheduled", "Tasks changed", "Unaffected tasks moved"]
EXAMPLE = [["A  Fixed plan", "A04, A05", "A01, A02, A03", "3", "0"], ["B  Full reschedule", "A02, A03, A04, A05", "A01", "5", "2 (A04, A05)"], ["ADAPT selective repair", "A02, A03, A04, A05", "A01", "3", "0"]]

COSTFORM = "Cost = 200 x (priority points of unscheduled tasks) + 3 x (unaffected tasks moved) + 1 x (previously scheduled tasks whose time changed)"

def stage_plan(rows):
    return (["ID", "Scenario", "Expected result", "Actual result"], [r + ["not run yet"] for r in rows])
S2 = stage_plan([["S2-1", "Upload a valid PDF", "Text extracted and searchable"], ["S2-2", "Upload a file above the size limit", "Clear rejection message; nothing stored"],
                 ["S2-3", "Photo of printed text", "Character error rate measured against a typed reference"], ["S2-4", "Photo of handwriting", "Unclear regions flagged as low confidence"],
                 ["S2-5", "Search for a term in three notes", "All notes containing the term are returned"], ["S2-6", "Delete an upload", "File, text and search index entries removed"]])
S3 = stage_plan([["S3-1", "Explain a notes page", "Each claim traceable to a source passage"], ["S3-2", "Generate 20 quiz questions", "Share answerable from the notes, judged by a human reviewer"],
                 ["S3-3", "AI service unavailable", "Planner still works; user told AI features are offline"], ["S3-4", "Quiz score below 50%", "45-minute priority-5 revision task created by the documented rule"]])
S4 = stage_plan([["S4-1", "Copy a paragraph from a source in the corpus", "Flagged with a source reference"], ["S4-2", "Properly quoted and cited paragraph", "Not reported as a missing citation"],
                 ["S4-3", "AI-writing indicator shown", "Advisory wording only; no accusation; explains the signals used"], ["S4-4", "Human-written text by non-native English writers", "False-positive rate measured before the feature is shown to anyone"]])
S5 = stage_plan([["S5-1", "Load the dashboard on a throttled connection", "Page weight and load time recorded against a target set first"], ["S5-2", "Urdu explanation of one topic", "Reviewed by a fluent Urdu speaker"],
                 ["S5-3", "Usability pilot with 5 to 10 students", "1 to 5 ratings for clarity, trust and ease of use"]])
