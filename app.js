const state = {
  assignments: [],
  topics: [],
  notesText: "",
  videoLength: "any",
  assignmentRange: "week",
  currentSubject: null,
};

const credibleSources = [
  { name: "Khan Academy", style: "short", specialty: ["biology", "chemistry", "math", "history", "economics"] },
  { name: "MIT OpenCourseWare", style: "deep", specialty: ["calculus", "physics", "computer science", "biology"] },
  { name: "CrashCourse", style: "short", specialty: ["history", "biology", "psychology", "literature"] },
  { name: "The Organic Chemistry Tutor", style: "deep", specialty: ["chemistry", "calculus", "physics", "algebra"] },
  { name: "Professor Dave Explains", style: "short", specialty: ["chemistry", "biology", "physics"] },
  { name: "Harvard Online", style: "deep", specialty: ["history", "writing", "computer science", "biology"] },
];

const stopWords = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between", "chapter",
  "class", "could", "course", "during", "each", "exam", "from", "have", "into", "lecture",
  "lesson", "more", "notes", "only", "other", "paper", "quiz", "reading", "review", "should",
  "slide", "slides", "study", "than", "that", "their", "there", "these", "this", "through",
  "topic", "under", "using", "what", "when", "where", "which", "with", "work", "would",
]);

const $ = (selector) => document.querySelector(selector);

const notesInput = $("#notesInput");
const assignmentList = $("#assignmentList");
const subjectOverview = $("#subjectOverview");
const topicCloud = $("#topicCloud");
const planList = $("#planList");
const videoList = $("#videoList");
const todayFocus = $("#todayFocus");
const canvasHelper = $("#canvasHelper");
const rightRail = $("#canvas");
const subjectsPanel = $("#subjects");
const classPage = $("#classPage");
const classTitle = $("#classTitle");
const classSummary = $("#classSummary");
const classAssignmentList = $("#classAssignmentList");
const calendarModal = $("#calendarModal");

function parseDate(value) {
  const trimmed = value.trim();
  if (/^\d{8}T?\d*/.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    return new Date(`${year}-${month}-${day}T12:00:00`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function daysUntil(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.ceil((end - start) / 86400000);
}

function upcomingOnly(assignments) {
  return assignments.filter((assignment) => daysUntil(assignment.dueDate) >= 0);
}

function assignmentsForRange() {
  return state.assignments.filter((assignment) => {
    const distance = daysUntil(assignment.dueDate);
    if (state.assignmentRange === "week") return distance <= 7;
    if (state.assignmentRange === "month") return distance <= 31;
    return true;
  });
}

function assignmentRangeLabel() {
  if (state.assignmentRange === "week") return "due in the next week";
  if (state.assignmentRange === "month") return "due in the next month";
  return "upcoming";
}

function getSubjectName(assignment) {
  const combined = `${assignment.title} ${assignment.details}`;
  const bracketCourse = combined.match(/\[([A-Z]{2,}\d{3,}[A-Z0-9_\-\s]*)\]?/);
  const inlineCourse = combined.match(/\b([A-Z]{2,}\d{3,}[A-Z0-9_\-\s]*(?:\d{4,5})?)\b/);
  const course = bracketCourse?.[1] || inlineCourse?.[1];
  if (course) return normalizeCourseName(course);

  const titleStart = assignment.title.split(/[:|-]/)[0].trim();
  const words = titleStart.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return titleCase(words.slice(0, 2).join(" "));
  return titleCase(words[0] || "General");
}

function normalizeCourseName(value) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([A-Z]{2,}\d{3,}[A-Z]?)\b\s*/i, (match) => match.toUpperCase());
}

function groupAssignments(assignments) {
  return assignments.reduce((groups, assignment) => {
    const subject = getSubjectName(assignment);
    if (!groups.has(subject)) groups.set(subject, []);
    groups.get(subject).push(assignment);
    return groups;
  }, new Map());
}

function currentAssignments() {
  if (!state.currentSubject) return state.assignments;
  return state.assignments.filter((assignment) => getSubjectName(assignment) === state.currentSubject);
}

function parseCanvasText(text) {
  if (!text.trim()) return [];
  if (text.includes("BEGIN:VEVENT")) return parseIcs(text);

  return upcomingOnly(text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const title = parts[0] || `Assignment ${index + 1}`;
      const dueDate = parseDate(parts[1] || "");
      const details = parts.slice(2).join(" | ");
      return dueDate ? { title, dueDate, details } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.dueDate - b.dueDate));
}

function parseIcs(text) {
  const unfoldedText = text.replace(/\r?\n[ \t]/g, "");
  return upcomingOnly(unfoldedText
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block, index) => {
      const summary = block.match(/SUMMARY(?:;[^:]*)?:(.+)/);
      const description = block.match(/DESCRIPTION(?:;[^:]*)?:(.+)/);
      const dateLine = block.match(/DTSTART(?:;[^:]*)?:(.+)/) || block.match(/DUE(?:;[^:]*)?:(.+)/);
      const dueDate = dateLine ? parseDate(dateLine[1]) : null;
      return dueDate
        ? {
            title: cleanIcsText(summary?.[1] || `Canvas item ${index + 1}`),
            dueDate,
            details: cleanIcsText(description?.[1] || ""),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.dueDate - b.dueDate));
}

function cleanIcsText(value) {
  return value.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}

function extractTopics(text) {
  const phrases = [];
  const phraseMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){1,3}\b/g) || [];
  phraseMatches.forEach((phrase) => {
    if (!phrase.toLowerCase().includes("canvas")) phrases.push(phrase.toLowerCase());
  });

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word));

  const counts = new Map();
  [...phrases, ...words].forEach((topic) => {
    counts.set(topic, (counts.get(topic) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([topic]) => titleCase(topic));
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function renderAssignments() {
  const visibleAssignments = assignmentsForRange();
  $("#assignmentCount").textContent = `${visibleAssignments.length} item${visibleAssignments.length === 1 ? "" : "s"}`;
  rightRail.classList.toggle("has-calendar", state.assignments.length > 0);

  if (!visibleAssignments.length) {
    assignmentList.innerHTML = `<div class="empty-state">No assignments ${assignmentRangeLabel()}.</div>`;
    renderSubjects();
    return;
  }

  assignmentList.innerHTML = [...groupAssignments(visibleAssignments).entries()]
    .map(([subject, assignments]) => {
      const items = assignments
        .map((item) => {
          const distance = daysUntil(item.dueDate);
          const timing = distance === 0 ? "due today" : `due in ${distance} day${distance === 1 ? "" : "s"}`;
          return `<div class="assignment-item"><strong>${escapeHtml(item.title)}</strong><span>${formatDate(item.dueDate)} &middot; ${timing}${item.details ? ` &middot; ${escapeHtml(item.details)}` : ""}</span></div>`;
        })
        .join("");
      return `<section class="assignment-group"><h5>${escapeHtml(subject)}</h5>${items}</section>`;
    })
    .join("");
  renderSubjects();
}

function renderSubjects() {
  if (!state.assignments.length) {
    subjectOverview.innerHTML = `<div class="empty-state">Upload your Canvas calendar to see class headings.</div>`;
    return;
  }

  subjectOverview.innerHTML = [...groupAssignments(state.assignments).entries()]
    .map(([subject, assignments]) => {
      const next = assignments[0];
      return `<button class="subject-card" type="button" data-subject="${escapeHtml(subject)}"><h4>${escapeHtml(subject)}</h4><span>${assignments.length} upcoming assignment${assignments.length === 1 ? "" : "s"}</span><strong>${escapeHtml(next.title)}</strong><p>${formatDate(next.dueDate)} &middot; ${daysUntilLabel(next.dueDate)}</p></button>`;
    })
    .join("");
}

function openClass(subject) {
  state.currentSubject = subject;
  subjectsPanel.classList.add("is-hidden");
  classPage.classList.remove("is-hidden");
  classTitle.textContent = subject;
  renderClassAssignments();
  renderTopics();
  generatePlan();
  window.location.hash = "class";
}

function returnHome() {
  state.currentSubject = null;
  classPage.classList.add("is-hidden");
  subjectsPanel.classList.remove("is-hidden");
  classAssignmentList.innerHTML = "";
  classTitle.textContent = "Class";
  classSummary.textContent = "Class assignments and study tools.";
  window.location.hash = "subjects";
}

function renderClassAssignments() {
  const assignments = currentAssignments();
  classSummary.textContent = `${assignments.length} upcoming assignment${assignments.length === 1 ? "" : "s"} in this class.`;
  classAssignmentList.innerHTML = assignments.length
    ? assignments
        .map((item) => `<div class="assignment-item"><strong>${escapeHtml(item.title)}</strong><span>${formatDate(item.dueDate)} &middot; ${daysUntilLabel(item.dueDate)}${item.details ? ` &middot; ${escapeHtml(item.details)}` : ""}</span></div>`)
        .join("")
    : `<div class="empty-state">No upcoming assignments for this class.</div>`;
}

function renderTopics() {
  $("#topicCount").textContent = `${state.topics.length} topic${state.topics.length === 1 ? "" : "s"}`;
  topicCloud.innerHTML = state.topics.length
    ? state.topics.map((topic) => `<span class="topic-chip">${escapeHtml(topic)}</span>`).join("")
    : `<div class="empty-state">No topics extracted yet.</div>`;
}

function generatePlan() {
  const topics = state.topics.length ? state.topics : ["core concepts", "lecture notes", "practice questions"];
  const classAssignments = currentAssignments();
  const assignments = classAssignments.length
    ? classAssignments
    : [{ title: "Upcoming class work", dueDate: new Date(Date.now() + 4 * 86400000), details: "Add Canvas items for a more accurate schedule." }];

  const plan = assignments.slice(0, 5).map((assignment, index) => {
    const topic = topics[index % topics.length];
    const urgency = Math.max(1, daysUntil(assignment.dueDate));
    const time = urgency <= 2 ? "45 minutes" : urgency <= 7 ? "35 minutes" : "25 minutes";
    return {
      title: `${time}: ${topic}`,
      details: `${assignment.title} is ${daysUntilLabel(assignment.dueDate)}. Review source material, make 5 flashcards, and answer 3 practice questions.`,
    };
  });

  planList.innerHTML = plan
    .map((item) => `<div class="plan-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.details)}</span></div>`)
    .join("");
  todayFocus.textContent = plan[0]?.details || "Add assignments and class materials to build your first plan.";
  renderVideos();
}

function daysUntilLabel(date) {
  const distance = daysUntil(date);
  if (distance < 0) return "past due";
  if (distance === 0) return "due today";
  if (distance === 1) return "due tomorrow";
  return `due in ${distance} days`;
}

function getVideoRecommendations() {
  const topics = state.topics.length ? state.topics.slice(0, 8) : ["study skills", "active recall", "spaced repetition"];
  return topics.flatMap((topic) => {
    const source = pickSource(topic);
    const backup = credibleSources.find((item) => item.name !== source.name && item.style !== source.style) || credibleSources[0];
    return [source, backup].map((provider) => ({
      topic,
      source: provider.name,
      length: provider.style,
      query: `${provider.name} ${topic} lesson`,
    }));
  });
}

function pickSource(topic) {
  const normalized = topic.toLowerCase();
  return (
    credibleSources.find((source) => source.specialty.some((keyword) => normalized.includes(keyword))) ||
    credibleSources[Math.abs(hashCode(topic)) % credibleSources.length]
  );
}

function renderVideos() {
  const recommendations = getVideoRecommendations().filter(
    (item) => state.videoLength === "any" || item.length === state.videoLength,
  );
  videoList.innerHTML = recommendations
    .slice(0, 10)
    .map(
      (item) => {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.query)}`;
        return `<div class="video-item"><strong>${escapeHtml(item.topic)}</strong><span><span class="video-source">${escapeHtml(item.source)}</span> &middot; ${item.length === "short" ? "short review" : "deeper lesson"} &middot; <a href="${url}" target="_blank" rel="noreferrer">Find videos</a></span></div>`;
      },
    )
    .join("");
}

function hashCode(value) {
  return value.split("").reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readFiles(files) {
  const readable = [];
  const unsupported = [];

  for (const file of files) {
    if (/\.(txt|md|csv|ics)$/i.test(file.name)) {
      readable.push(await file.text());
    } else {
      unsupported.push(file.name);
    }
  }

  if (readable.length) {
    notesInput.value = `${notesInput.value}\n\n${readable.join("\n\n")}`.trim();
  }

  if (unsupported.length) {
    notesInput.value = `${notesInput.value}\n\n[Uploaded for next backend step: ${unsupported.join(", ")}]`.trim();
  }
}

$("#canvasFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const calendarText = await file.text();
  state.assignments = parseCanvasText(calendarText);
  canvasHelper.textContent = state.assignments.length
    ? `Loaded ${state.assignments.length} upcoming Canvas item${state.assignments.length === 1 ? "" : "s"} from ${file.name}. Past assignments were skipped.`
    : `I could not find any upcoming assignments in ${file.name}. Past assignments are skipped automatically.`;
  canvasHelper.classList.toggle("is-warning", !state.assignments.length);
  renderAssignments();
  calendarModal.classList.add("is-hidden");
});

$("#extractTopicsBtn").addEventListener("click", () => {
  state.notesText = notesInput.value;
  state.topics = extractTopics(`${notesInput.value}\n${currentAssignments().map((item) => `${item.title} ${item.details}`).join("\n")}`);
  renderTopics();
  renderVideos();
});

$("#generatePlanBtn").addEventListener("click", async () => {
  if (!state.assignments.length) {
    canvasHelper.textContent = "Upload your downloaded Canvas .ics file first.";
    canvasHelper.classList.add("is-warning");
  }
  if (!state.topics.length) {
    state.topics = extractTopics(`${notesInput.value}\n${currentAssignments().map((item) => `${item.title} ${item.details}`).join("\n")}`);
  }
  renderAssignments();
  renderClassAssignments();
  renderTopics();
  generatePlan();
});

$("#clearBtn").addEventListener("click", () => {
  state.assignments = [];
  state.topics = [];
  state.notesText = "";
  notesInput.value = "";
  $("#canvasFile").value = "";
  canvasHelper.textContent = "";
  canvasHelper.classList.remove("is-warning");
  renderAssignments();
  returnHome();
  renderTopics();
  planList.innerHTML = `<div class="empty-state">Generate a plan after adding Canvas items and materials.</div>`;
  renderVideos();
});

$("#materialFiles").addEventListener("change", async (event) => {
  await readFiles(event.target.files);
});

document.querySelectorAll(".filter:not(.assignment-filter)").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter:not(.assignment-filter)").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.videoLength = button.dataset.length;
    renderVideos();
  });
});

document.querySelectorAll(".assignment-filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".assignment-filter").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.assignmentRange = button.dataset.assignmentRange;
    renderAssignments();
  });
});

subjectOverview.addEventListener("click", (event) => {
  const card = event.target.closest(".subject-card");
  if (!card) return;
  openClass(card.dataset.subject);
});

$("#returnHomeBtn").addEventListener("click", returnHome);

$("#sidebarToggle").addEventListener("click", () => {
  document.body.classList.toggle("sidebar-collapsed");
});

$("#openCalendarModalBtn").addEventListener("click", () => {
  calendarModal.classList.remove("is-hidden");
});

$("#closeCalendarModalBtn").addEventListener("click", () => {
  calendarModal.classList.add("is-hidden");
});

calendarModal.addEventListener("click", (event) => {
  if (event.target === calendarModal) calendarModal.classList.add("is-hidden");
});

renderAssignments();
renderSubjects();
renderTopics();
planList.innerHTML = `<div class="empty-state">Generate a plan after adding Canvas items and materials.</div>`;
renderVideos();
