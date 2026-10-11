/* Inkwell Instructor Console — mock program data + views on ui-core. */

const MOCK = {
  courses: [
    { id: "c1", name: "BIO-201: Cell Biology", learners: 24, docs: 18, decks: 9, tests: 6, guides: 4, completion: 71, avg: 78, health: "good" },
    { id: "c2", name: "CHEM-110: Organic Chemistry I", learners: 19, docs: 22, decks: 12, tests: 8, guides: 5, completion: 58, avg: 66, health: "watch" },
    { id: "c3", name: "MATH-150: Linear Algebra", learners: 15, docs: 11, decks: 6, tests: 5, guides: 3, completion: 82, avg: 84, health: "good" },
    { id: "c4", name: "HIST-220: Modern Europe", learners: 10, docs: 30, decks: 4, tests: 3, guides: 6, completion: 39, avg: 59, health: "risk" },
  ],
  learners: [
    { id: "l1", name: "Amira K.", courses: 3, streak: 12, mins: 340, mastery: 86, last: "today", risk: false },
    { id: "l2", name: "Dev P.", courses: 2, streak: 0, mins: 25, mastery: 41, last: "9d ago", risk: true },
    { id: "l3", name: "Sofia R.", courses: 4, streak: 26, mins: 520, mastery: 91, last: "today", risk: false },
    { id: "l4", name: "Liam T.", courses: 2, streak: 3, mins: 130, mastery: 63, last: "yesterday", risk: false },
    { id: "l5", name: "Noor H.", courses: 3, streak: 1, mins: 45, mastery: 48, last: "4d ago", risk: true },
  ],
  content: [
    { id: "k1", type: "flashcards", name: "Krebs cycle deck (42 cards)", course: "BIO-201", uses: 310, stat: "retention 81%", state: "live" },
    { id: "k2", type: "practice test", name: "Midterm mock v2 (30 q)", course: "CHEM-110", uses: 54, stat: "avg 66%", state: "live" },
    { id: "k3", type: "study guide", name: "Eigenvalues crash guide", course: "MATH-150", uses: 88, stat: "rated 4.6/5", state: "live" },
    { id: "k4", type: "flashcards", name: "Treaty dates deck (60 cards)", course: "HIST-220", uses: 12, stat: "retention 44%", state: "stale" },
    { id: "k5", type: "practice test", name: "Quiz 1 (10 q)", course: "BIO-201", uses: 209, stat: "avg 82%", state: "live" },
  ],
  items: [
    { q: "Which intermediate links glycolysis to the Krebs cycle?", test: "BIO-201 · Quiz 1", miss: 62, flag: "distractor B chosen 41%" },
    { q: "Rank SN1 vs SN2 rates for tertiary substrates", test: "CHEM-110 · Midterm mock", miss: 58, flag: "concept gap" },
    { q: "Compute det(A) for the 3×3 shear matrix", test: "MATH-150 · Test 3", miss: 31, flag: "arithmetic slips" },
    { q: "Year of the Congress of Vienna", test: "HIST-220 · Quiz 2", miss: 24, flag: "ok" },
  ],
  dist: [2, 4, 3, 7, 10, 14, 12, 9, 5, 2], // score histogram buckets 0-100
};

let learnerFilter = "all";
const health = h => `<span class="pill ${{ good: "ok", watch: "warn", risk: "err" }[h]}">${h}</span>`;
const barCell = (v, warnAt = 60) => `<div class="bar-track" style="width:110px"><div class="bar-fill" style="width:${v}%;${v < warnAt ? "background:var(--warn)" : ""}"></div></div><div class="sub">${v}%</div>`;

function learnerRows() {
  const list = MOCK.learners.filter(l => learnerFilter === "all" || (learnerFilter === "risk" ? l.risk : !l.risk));
  if (!list.length) return `<tr><td colspan="6"><div class="empty">No learners match.</div></td></tr>`;
  return list.map(l => row("openLearner", l.id, `
    <td><strong>${esc(l.name)}</strong>${l.risk ? ' <span class="risk">· at risk</span>' : ""}</td>
    <td>${l.courses}</td>
    <td>${l.streak ? l.streak + "d 🔥" : "—"}</td>
    <td>${l.mins} min</td>
    <td>${barCell(l.mastery)}</td>
    <td>${l.last}</td>`)).join("");
}

const views = {
  overview() {
    return `
      <div class="grid kpis">
        <div class="card"><h3>Active learners (7d)</h3><div class="kpi-value">68</div>
          <div class="kpi-delta up">+6 vs last week</div>${spark([44,48,52,55,58,61,65,68])}</div>
        <div class="card"><h3>Study time / learner</h3><div class="kpi-value">4.2h</div>
          <div class="kpi-delta up">weekly average</div>${spark([3.1,3.3,3.5,3.6,3.8,3.9,4.1,4.2])}</div>
        <div class="card"><h3>Avg practice score</h3><div class="kpi-value">72%</div>
          <div class="kpi-delta down">CHEM-110 dragging (66%)</div>${spark([70,71,73,72,74,73,72,72])}</div>
        <div class="card"><h3>At-risk learners</h3><div class="kpi-value risk">2</div>
          <div class="kpi-delta down">no activity > 3 days + mastery < 50%</div></div>
      </div>
      <div class="grid two-col">
        <div class="card"><h3>Score distribution — all practice tests (30d)</h3>
          <div class="dist" role="img" aria-label="Score histogram peaking at 50 to 70 percent">${MOCK.dist.map(v =>
            `<span style="height:${v * 6}%"></span>`).join("")}</div>
          <div class="legend"><span>0%</span><span style="margin-left:auto">100%</span></div></div>
        <div class="card"><h3>Course health</h3>
          ${MOCK.courses.map(c => `
            <div class="bar-row" style="grid-template-columns:1fr 110px 70px"><span>${esc(c.name)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${c.completion}%"></div></div>
              ${health(c.health)}</div>`).join("")}
        </div>
      </div>`;
  },

  courses() {
    const rows = MOCK.courses.map(c => row("openCourse", c.id, `
      <td><strong>${esc(c.name)}</strong></td>
      <td>${c.learners}</td>
      <td><span class="pill muted">${c.docs} docs</span> <span class="pill muted">${c.decks} decks</span>
        <span class="pill muted">${c.tests} tests</span> <span class="pill muted">${c.guides} guides</span></td>
      <td>${barCell(c.completion)}</td>
      <td class="mono">${c.avg}%</td>
      <td>${health(c.health)}</td>`)).join("");
    return `
      <div class="section-head"><div><h2>Courses</h2>
        <div class="section-sub">Enrollment, content inventory, and outcomes</div></div>
        ${demoBtn("＋ New course", "create a course", "primary")}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Course</th><th>Learners</th><th>Content</th><th>Completion</th><th>Avg score</th><th>Health</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  },

  learners() {
    return `
      <div class="section-head"><div><h2>Learners</h2>
        <div class="section-sub">Progress, streaks, and mastery across courses</div></div>
        <div class="toolbar">
          ${chip("l", "all", "All", learnerFilter === "all")}
          ${chip("l", "risk", "At risk", learnerFilter === "risk")}
          ${chip("l", "ok", "On track", learnerFilter === "ok")}
        </div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Learner</th><th>Courses</th><th>Streak</th><th>Study (7d)</th><th>Mastery</th><th>Last active</th></tr></thead>
        <tbody id="learnerRows">${learnerRows()}</tbody></table></div>`;
  },

  content() {
    const rows = MOCK.content.map(k => `
      <tr><td><span class="pill info">${k.type}</span></td>
        <td><strong>${esc(k.name)}</strong></td>
        <td>${esc(k.course)}</td><td>${k.uses}</td><td>${esc(k.stat)}</td>
        <td><span class="pill ${k.state === "live" ? "ok" : "warn"}">${k.state}</span></td>
        <td>${demoBtn("Regenerate", "regenerate this artifact with AI", "primary")} ${k.state === "stale" ? demoBtn("Retire", "retire stale content", "ghost small danger") : ""}</td></tr>`).join("");
    return `
      <div class="section-head"><div><h2>Content</h2>
        <div class="section-sub">Generated study artifacts across all courses</div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Artifact</th><th>Course</th><th>Uses (30d)</th><th>Signal</th><th>State</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  },

  items() {
    const rows = MOCK.items.map(i => `
      <tr><td>${esc(i.q)}</td><td class="mono" style="font-size:11px">${esc(i.test)}</td>
        <td><span class="pill ${i.miss > 50 ? "err" : i.miss > 30 ? "warn" : "ok"}">${i.miss}% missed</span></td>
        <td>${esc(i.flag)}</td>
        <td>${demoBtn("Review", "open question editor")}</td></tr>`).join("");
    return `
      <div class="section-head"><div><h2>Item Analysis</h2>
        <div class="section-sub">Practice-test questions ranked by miss rate (30d)</div></div>
        ${demoBtn("Export CSV", "export item analysis")}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Question</th><th>Test</th><th>Miss rate</th><th>Diagnosis</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  },
};

const actions = {
  openCourse(id) {
    const c = MOCK.courses.find(x => x.id === id);
    UI.openDrawer(esc(c.name), `
      <dl class="kv"><dt>Learners</dt><dd>${c.learners}</dd><dt>Completion</dt><dd>${c.completion}%</dd>
        <dt>Avg score</dt><dd>${c.avg}%</dd><dt>Health</dt><dd>${c.health}</dd></dl>
      <div class="card" style="background:var(--panel2)"><h3>Inventory</h3>
        <dl class="kv"><dt>Documents</dt><dd>${c.docs}</dd><dt>Flashcard decks</dt><dd>${c.decks}</dd>
          <dt>Practice tests</dt><dd>${c.tests}</dd><dt>Study guides</dt><dd>${c.guides}</dd></dl></div>
      <div class="toolbar">${demoBtn("Open course", "open the learner-facing course page", "primary")}
        ${demoBtn("Message cohort", "send an announcement")}</div>`);
  },
  openLearner(id) {
    const l = MOCK.learners.find(x => x.id === id);
    UI.openDrawer(esc(l.name), `
      <dl class="kv"><dt>Courses</dt><dd>${l.courses}</dd><dt>Mastery</dt><dd>${l.mastery}%</dd>
        <dt>Streak</dt><dd>${l.streak} days</dd><dt>Study (7d)</dt><dd>${l.mins} min</dd>
        <dt>Last active</dt><dd>${l.last}</dd></dl>
      ${l.risk ? `<div class="card" style="background:var(--panel2)"><h3>⚠ At risk</h3>
        <p style="font-size:13px;line-height:1.5">No activity in ${l.last.replace(" ago", "")} and mastery below 50%. Suggested: assign a review deck for weakest topics.</p></div>` : ""}
      <div class="toolbar">${demoBtn("Nudge", "send a study reminder", "primary")}
        ${demoBtn("Assign review deck", "auto-build a review deck from misses")}</div>`);
  },
  filter(id) {
    learnerFilter = id.split(":")[1];
    if (location.hash !== "#learners") location.hash = "learners";
    UI.patch("#learnerRows", learnerRows());
    document.querySelectorAll(".toolbar .chip").forEach(c =>
      c.classList.toggle("active", c.dataset.id === "l:" + learnerFilter));
  },
};

UI.init({ views, actions, titles: { overview: "Overview", courses: "Courses", learners: "Learners", content: "Content", items: "Item Analysis" } });
