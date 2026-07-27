'use client';

import React, { useState } from 'react';
import { Sparkles, Calendar, BookOpen, CheckCircle, Download, Clock, ArrowRight, Loader2, Plus, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';

import JSZip from 'jszip';




interface Milestone {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  weightage?: string;
}

interface StudyWeek {
  weekNumber: number;
  focusTopics: string;
  recommendedTasks: string[];
}

interface ScheduleData {
  courseName: string;
  summary: string;
  milestones: Milestone[];
  studyPlan: StudyWeek[];
}

export default function Home() {
  const [syllabusText, setSyllabusText] = useState('');
  const [dailyHours, setDailyHours] = useState('2');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ScheduleData | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  // State for manual custom deadline creation
  const [customTitle, setCustomTitle] = useState('');
  const [customDate, setCustomDate] = useState('');

  // Extract text from PDF files
 // Extract text from PDF files (dynamically imported to prevent SSR DOMMatrix errors)
  const extractPdfText = async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker source dynamically
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };
  // Extract text from PPTX slides
  const extractPptxText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let extractedText = '';

    const slideFiles = Object.keys(zip.files).filter((fileName) =>
      fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml')
    );

    for (const slidePath of slideFiles) {
      const slideXml = await zip.files[slidePath].async('string');
      const matches = slideXml.match(/<a:t>([^<]+)<\/a:t>/g);
      if (matches) {
        const text = matches.map((m) => m.replace(/<\/?a:t>/g, '')).join(' ');
        extractedText += text + '\n';
      }
    }
    return extractedText;
  };

  // Universal File Upload Handler — now supports multiple files and APPENDS
  // instead of overwriting, so uploading several lectures accumulates all of
  // their text rather than losing everything but the last one.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingFile(true);
    setError('');

    try {
      let combinedText = '';

      for (const file of Array.from(files)) {
        const fileName = file.name.toLowerCase();
        let extractedText = '';

        if (fileName.endsWith('.pdf')) {
          extractedText = await extractPdfText(file);
        } else if (fileName.endsWith('.pptx')) {
          extractedText = await extractPptxText(file);
        } else {
          // Fallback for .txt, .md, etc.
          extractedText = await file.text();
        }

        combinedText += `\n\n--- Lecture: ${file.name} ---\n\n${extractedText}`;
      }

      if (!combinedText.trim()) {
        throw new Error('No readable text found in the uploaded file(s).');
      }

      // Append to whatever is already in the box instead of replacing it,
      // so multiple uploads (or upload + pasted text) all get combined.
      setSyllabusText((prev) => (prev ? prev + combinedText : combinedText.trim()));
    } catch (err: any) {
      console.error(err);
      setError('Failed to extract text from file: ' + (err.message || 'Unknown error'));
    } finally {
      setParsingFile(false);
      // reset the input so re-uploading the same file again still fires onChange
      e.target.value = '';
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deadlineDate) {
      setError('Please set your deadline date so the schedule spans the right window.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabusText, dailyHours, deadlineDate, customPrompt }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Something went wrong');

      setData(result);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    } catch (err: any) {
      setError(err.message || 'Failed to parse syllabus. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = (key: string) => {
    setCompletedTasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getDaysRemaining = (dueDateString: string) => {
    const dueDate = new Date(dueDateString);
    if (isNaN(dueDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Passed';
    if (diffDays === 0) return 'Today!';
    return `${diffDays} days left`;
  };

  const addCustomMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle || !customDate || !data) return;

    const newMilestone: Milestone = {
      id: `custom-${Date.now()}`,
      title: customTitle,
      type: 'Custom Task',
      dueDate: customDate,
      weightage: 'Manual',
    };

    setData({
      ...data,
      milestones: [...data.milestones, newMilestone],
    });

    setCustomTitle('');
    setCustomDate('');
  };

  // Converts a "YYYY-MM-DD" (or any parseable) date string into the
  // UTC ICS timestamp format. Falls back to a safe default only if the
  // date genuinely can't be parsed, instead of silently hardcoding one
  // date for every event like before.
  const toICSDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return '20260101T090000Z';
    }
    // Anchor at 09:00 local-ish time on the due date, in UTC ICS format.
    d.setHours(9, 0, 0, 0);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const exportToICS = () => {
    if (!data) return;
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Syllabus2Schedule//EN\n";

    data.milestones.forEach((m) => {
      icsContent += `BEGIN:VEVENT\nSUMMARY:[${data.courseName}] ${m.title}\nDESCRIPTION:Type: ${m.type} | Weightage: ${m.weightage || 'N/A'}\nDTSTART:${toICSDate(m.dueDate)}\nEND:VEVENT\n`;
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${data.courseName.replace(/\s+/g, '_')}_schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Syllabus2Schedule</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
          >
            GitHub Repo
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Intro */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl mb-4">
            Turn dense syllabi into an <span className="text-indigo-400">actionable roadmap</span>.
          </h1>
          <p className="text-slate-400 text-base">
            Upload your syllabus/lectures (.pdf, .pptx, .txt) or paste text below. Set your deadline and AI will generate a schedule that actually fits your timeline.
          </p>
        </div>

        {/* Form Input Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-12">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Upload Syllabus / Lecture Files (.pdf, .pptx, .txt, .md) — you can select multiple
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.pptx,.txt,.md"
                    multiple
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-950 file:text-indigo-300 hover:file:bg-indigo-900 cursor-pointer"
                  />
                  {parsingFile && (
                    <div className="flex items-center gap-1.5 text-xs text-indigo-400 shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin" /> Extracting file text...
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Tip: select all your lecture files at once (Ctrl/Cmd+click), or upload them one at a time — each one gets added to the box below instead of replacing it.
                </p>
              </div>

              <textarea
                rows={6}
                required
                value={syllabusText}
                onChange={(e) => setSyllabusText(e.target.value)}
                placeholder="Extracted file text or pasted syllabus content will appear here..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
              />
              {syllabusText && (
                <button
                  type="button"
                  onClick={() => setSyllabusText('')}
                  className="mt-2 text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Clear content
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Additional instructions (optional)
              </label>
              <textarea
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Focus more on weak topics, prefer daily tasks instead of weekly, skip weekends, keep tasks under 1 hour..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <label className="text-sm text-slate-300 whitespace-nowrap">Deadline:</label>
                  <input
                    type="date"
                    required
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <label className="text-sm text-slate-300 whitespace-nowrap">Study hours/day:</label>
                  <select
                    value={dailyHours}
                    onChange={(e) => setDailyHours(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg p-2 focus:ring-indigo-500"
                  >
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="4">4+ hours</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || parsingFile}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white font-medium px-6 py-2.5 rounded-xl transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating Schedule...
                  </>
                ) : (
                  <>
                    Generate Schedule <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Render Generated Schedule Output */}
        {data && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header / Summary Card */}
            <div className="bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-900/50 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-semibold tracking-wider text-indigo-400 uppercase">Parsed Course</span>
                <h2 className="text-2xl font-bold text-white mt-1">{data.courseName}</h2>
                <p className="text-slate-400 text-sm mt-2 max-w-2xl">{data.summary}</p>
              </div>
              <button
                onClick={exportToICS}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-4 py-2.5 rounded-xl border border-slate-700 transition flex items-center gap-2 shrink-0 self-start md:self-auto"
              >
                <Download className="w-4 h-4 text-indigo-400" /> Export to iCal (.ics)
              </button>
            </div>

            {/* Milestones & Weekly Plan Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Milestones & Custom Deadline Form */}
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit">
                <div className="flex items-center gap-2 mb-6">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-lg text-white">Course Milestones</h3>
                </div>

                {/* Add Custom Deadline Form */}
                <form onSubmit={addCustomMilestone} className="mb-6 p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <span className="text-xs font-semibold text-slate-400 block">Add Custom Deadline</span>
                  <input
                    type="text"
                    required
                    placeholder="Task title (e.g. Quiz 3)"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="date"
                    required
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Deadline
                  </button>
                </form>

                {/* Milestones List */}
                <div className="space-y-4">
                  {data.milestones.map((m) => {
                    const daysRemaining = getDaysRemaining(m.dueDate);
                    return (
                      <div key={m.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                            {m.type}
                          </span>
                          {daysRemaining && (
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                              ⌛ {daysRemaining}
                            </span>
                          )}
                        </div>

                        <h4 className="font-medium text-slate-200 text-sm mt-1">{m.title}</h4>
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                          <span>Due: <span className="text-slate-300">{m.dueDate}</span></span>
                          {m.weightage && <span className="text-slate-500">{m.weightage}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Weekly Breakdown */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-lg text-white">Weekly Study Breakdown</h3>
                </div>

                {data.studyPlan.map((week) => (
                  <div key={week.weekNumber} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-indigo-300 text-base">Week {week.weekNumber}</h4>
                      <span className="text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                        Focus Area
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-200 mb-4">{week.focusTopics}</p>

                    <ul className="space-y-2.5">
                      {week.recommendedTasks.map((task, idx) => {
                        const taskKey = `w${week.weekNumber}-t${idx}`;
                        const isDone = !!completedTasks[taskKey];
                        return (
                          <li
                            key={idx}
                            onClick={() => toggleTask(taskKey)}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-sm cursor-pointer transition ${
                              isDone
                                ? 'bg-slate-950/50 border-slate-900 text-slate-500 line-through'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <CheckCircle
                              className={`w-4 h-4 mt-0.5 shrink-0 transition ${
                                isDone ? 'text-emerald-500' : 'text-slate-600'
                              }`}
                            />
                            <span>{task}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
