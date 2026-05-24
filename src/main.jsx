import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CgpaPredictor } from './components/CgpaPredictor.jsx';
import { GpaGrowthGraph } from './components/GpaGrowthGraph.jsx';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './styles.css';

const GRADES = [
  { label: 'O', points: 10 },
  { label: 'A+', points: 9 },
  { label: 'A', points: 8 },
  { label: 'B+', points: 7 },
  { label: 'B', points: 6 },
  { label: 'C', points: 5 },
  { label: 'F', points: 0 },
  { label: 'Ab', points: 0 },
];

const GRADE_NAMES = {
  O: 'Outstanding',
  'A+': 'Excellent',
  A: 'Very Good',
  'B+': 'Good',
  B: 'Average',
  C: 'Pass',
  F: 'Fail',
  Ab: 'Absent',
};

const APP_STATE_KEY = 'jntuh-gpa-state-v2';
const THEME_KEY = 'jntuh-gpa-theme';
const USER_KEY = 'jntuh-gpa-anonymous-user';
const HISTORY_FALLBACK_KEY = 'jntuh-gpa-history-fallback';
const DB_NAME = 'jntuh-gpa-calculator';
const DB_VERSION = 1;
const HISTORY_STORE = 'history';

const makeId = () =>
  crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const getAnonymousUserId = () => {
  const existing = localStorage.getItem(USER_KEY);
  if (existing) return existing;
  const userId = `student-${makeId()}`;
  localStorage.setItem(USER_KEY, userId);
  return userId;
};

const createSubject = (index = 1) => ({
  id: makeId(),
  name: '',
  credits: '',
  grade: 'O',
});

const createSemester = (index = 1) => ({
  id: makeId(),
  label: `Semester ${index}`,
  subjects: [createSubject(1)],
});

const gradePointFor = (grade) => GRADES.find((item) => item.label === grade)?.points ?? 0;

const normalizeSubject = (subject, index) => {
  const name = typeof subject?.name === 'string' ? subject.name : '';

  return {
    id: subject?.id || makeId(),
    name: /^Subject \d+$/.test(name.trim()) ? '' : name,
    credits: subject?.credits ?? subject?.credit ?? '',
    grade: GRADES.some((grade) => grade.label === subject?.grade) ? subject.grade : 'O',
  };
};

const normalizeSemester = (semester, index) => {
  const subjects = Array.isArray(semester?.subjects) ? semester.subjects : [];

  return {
    id: semester?.id || makeId(),
    label: typeof semester?.label === 'string' && semester.label.trim() ? semester.label : `Semester ${index + 1}`,
    subjects: subjects.length ? subjects.map(normalizeSubject) : [createSubject(1)],
  };
};

const normalizeSemesters = (semesters) => {
  if (!Array.isArray(semesters) || semesters.length === 0) return [createSemester(1)];
  return semesters.map(normalizeSemester);
};

const toCredit = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatNumber = (value, digits = 2) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(digits);
};

const calculateSemester = (subjects) => {
  const totals = subjects.reduce(
    (acc, subject) => {
      const credits = toCredit(subject.credits);
      return {
        credits: acc.credits + credits,
        weightedPoints: acc.weightedPoints + credits * gradePointFor(subject.grade),
        invalidSubjects:
          acc.invalidSubjects + (credits <= 0 ? 1 : 0),
      };
    },
    { credits: 0, weightedPoints: 0, invalidSubjects: 0 },
  );

  return {
    ...totals,
    sgpa: totals.credits > 0 ? totals.weightedPoints / totals.credits : 0,
  };
};

const performanceFor = (score) => {
  if (score >= 9) return 'Excellent';
  if (score >= 8) return 'Very Good';
  if (score >= 7) return 'Good';
  if (score >= 6) return 'Average';
  if (score > 0) return 'Needs Focus';
  return 'Start entering grades';
};

const openHistoryDb = () =>
  new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readHistory = async (userId) => {
  try {
    const db = await openHistoryDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const store = tx.objectStore(HISTORY_STORE);
      const request = store.index('userId').getAll(userId);
      request.onsuccess = () =>
        resolve(request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    const fallback = JSON.parse(localStorage.getItem(HISTORY_FALLBACK_KEY) || '[]');
    return fallback.filter((item) => item.userId === userId);
  }
};

const writeHistoryItem = async (item) => {
  try {
    const db = await openHistoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const fallback = JSON.parse(localStorage.getItem(HISTORY_FALLBACK_KEY) || '[]');
    localStorage.setItem(HISTORY_FALLBACK_KEY, JSON.stringify([item, ...fallback].slice(0, 30)));
  }
};

const deleteHistoryItem = async (itemId) => {
  try {
    const db = await openHistoryDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      store.delete(itemId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const fallback = JSON.parse(localStorage.getItem(HISTORY_FALLBACK_KEY) || '[]');
    localStorage.setItem(
      HISTORY_FALLBACK_KEY,
      JSON.stringify(fallback.filter((item) => item.id !== itemId)),
    );
  }
};

const clearHistory = async (userId) => {
  try {
    const db = await openHistoryDb();
    const items = await readHistory(userId);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      items.forEach((item) => store.delete(item.id));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const fallback = JSON.parse(localStorage.getItem(HISTORY_FALLBACK_KEY) || '[]');
    localStorage.setItem(
      HISTORY_FALLBACK_KEY,
      JSON.stringify(fallback.filter((item) => item.userId !== userId)),
    );
  }
};

function App() {
  const [userId] = useState(getAnonymousUserId);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [activeTab, setActiveTab] = useState('sgpa');
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState([]);
  const [semesters, setSemesters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_STATE_KEY));
      return normalizeSemesters(saved?.semesters);
    } catch {
      return [createSemester(1)];
    }
  });
  const [activeSemesterId, setActiveSemesterId] = useState(() => semesters[0]?.id);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(APP_STATE_KEY, JSON.stringify({ semesters }));
    if (!semesters.some((semester) => semester.id === activeSemesterId)) {
      setActiveSemesterId(semesters[0]?.id);
    }
  }, [semesters, activeSemesterId]);

  useEffect(() => {
    readHistory(userId).then(setHistory);
  }, [userId]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => {
      setStatus("");
    }, 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const semesterResults = useMemo(
    () =>
      semesters.map((semester) => ({
        ...semester,
        result: calculateSemester(semester.subjects),
      })),
    [semesters],
  );

  const activeSemester = semesterResults.find((semester) => semester.id === activeSemesterId) || semesterResults[0];

  const cgpaSummary = useMemo(() => {
    const validSemesters = semesterResults.filter((semester) => semester.result.credits > 0);
    const totalCredits = validSemesters.reduce((sum, semester) => sum + semester.result.credits, 0);
    const totalWeightedPoints = validSemesters.reduce(
      (sum, semester) => sum + semester.result.weightedPoints,
      0,
    );
    const cgpa = totalCredits > 0 ? totalWeightedPoints / totalCredits : 0;

    return {
      totalCredits,
      totalWeightedPoints,
      cgpa,
      percentage: cgpa >= 0.5 ? (cgpa - 0.5) * 10 : 0,
    };
  }, [semesterResults]);

  const updateSubject = (semesterId, subjectId, key, value) => {
    setSemesters((current) =>
      current.map((semester) =>
        semester.id === semesterId
          ? {
              ...semester,
              subjects: semester.subjects.map((subject) =>
                subject.id === subjectId ? { ...subject, [key]: value } : subject,
              ),
            }
          : semester,
      ),
    );
  };

  const addSubject = () => {
    setSemesters((current) =>
      current.map((semester) =>
        semester.id === activeSemester.id
          ? { ...semester, subjects: [...semester.subjects, createSubject(semester.subjects.length + 1)] }
          : semester,
      ),
    );
  };

  const removeSubject = (subjectId) => {
    setSemesters((current) =>
      current.map((semester) =>
        semester.id === activeSemester.id && semester.subjects.length > 1
          ? { ...semester, subjects: semester.subjects.filter((subject) => subject.id !== subjectId) }
          : semester,
      ),
    );
  };

  const addSemester = () => {
    const semester = createSemester(semesters.length + 1);
    setSemesters((current) => [...current, semester]);
    setActiveSemesterId(semester.id);
  };

  const removeSemester = () => {
    if (semesters.length === 1) return;
    setSemesters((current) => current.filter((semester) => semester.id !== activeSemester.id));
  };

  const renameSemester = (label) => {
    setSemesters((current) =>
      current.map((semester) => (semester.id === activeSemester.id ? { ...semester, label } : semester)),
    );
  };

  const resetCalculator = () => {
    const semester = createSemester(1);
    setSemesters([semester]);
    setActiveSemesterId(semester.id);
    setStatus('Calculator reset. History is still saved.');
  };

  const saveSnapshot = async () => {
    if (cgpaSummary.totalCredits <= 0 || activeSemester.result.invalidSubjects > 0) {
      setStatus('Add valid credits before saving.');
      return;
    }

    const item = {
      id: makeId(),
      userId,
      createdAt: new Date().toISOString(),
      semesters: semesterResults.length,
      sgpa: activeSemester.result.sgpa,
      cgpa: cgpaSummary.cgpa,
      percentage: cgpaSummary.percentage,
      credits: cgpaSummary.totalCredits,
      label: activeSemester.label || 'Semester',
    };

    await writeHistoryItem(item);
    const nextHistory = await readHistory(userId);
    setHistory(nextHistory);
    setStatus('Result saved to this browser.');
  };

  const clearSavedHistory = async () => {
    await clearHistory(userId);
    setHistory([]);
    setStatus('History cleared for this browser user.');
  };

  const removeSavedHistoryItem = async (itemId) => {
    await deleteHistoryItem(itemId);
    const nextHistory = await readHistory(userId);
    setHistory(nextHistory);
    setStatus('History item deleted.');
  };

  const handleShare = async () => {
    const shareData = {
      title: "JNTUH SGPA & CGPA Calculator",
      text: "Check out this fast, free JNTUH SGPA & CGPA Calculator! R22, R18, and R16 compatible.",
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        setStatus("Link copied to clipboard!");
      }
    } catch (err) {
      console.error("Error sharing", err);
    }
  };

  const activeSubjects = activeSemester?.subjects || [];
  const activeResult = activeSemester?.result || { sgpa: 0, credits: 0, weightedPoints: 0 };

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="img">
                <path d="M3 8.8 12 4l9 4.8-9 4.8L3 8.8Z" />
                <path d="M6.5 11.2v4.1c1.4 1.4 3.2 2.1 5.5 2.1s4.1-.7 5.5-2.1v-4.1" />
              </svg>
            </div>
            <div>
              <strong>JNTUH GPA Calc</strong>
              <span>R22 - R18 - R16 compatible</span>
            </div>
          </div>
          <div className="header-actions">
            <span>v1.0</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 14.6A7.7 7.7 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m0-12.8L4.2 4.2m15.6 15.6-1.4-1.4" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="app-shell">
        <section className="hero">
          <p className="kicker">Calculator - JNTU Hyderabad</p>
          <h1>
            Calculate your <span>SGPA</span> & <span>CGPA</span>
            <br />
            <em>in seconds.</em>
          </h1>
          <p className="hero-copy">
            A no-fluff, dependable GPA tool for JNTUH students. Add subjects, pick grades, and get instant
            credit-weighted results. R22, R18, and R16 ready.
          </p>
        </section>

        <section className="grade-card">
          <p className="kicker">JNTUH grade points</p>
          <div className="grade-chips">
            {GRADES.map((grade) => (
              <span className="grade-chip" key={grade.label}>
                <strong>{grade.label}</strong>
                <small>-</small>
                <span>{grade.points}</span>
              </span>
            ))}
          </div>
        </section>

        <nav className="tabs" aria-label="Calculator sections">
          {['sgpa', 'cgpa', 'history'].map((tab) => (
            <button
              className={activeTab === tab ? 'active' : ''}
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </nav>

        {activeTab === 'sgpa' && (
          <section className="work-grid">
            <section className="panel form-panel">
              <div className="form-top">
                <label className="input-group semester-input">
                  <span>Semester label</span>
                  <input value={activeSemester?.label || ''} onChange={(event) => renameSemester(event.target.value)} />
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {semesters.length > 1 && (
                    <button className="ghost-button" type="button" onClick={removeSemester} style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                      Delete
                    </button>
                  )}
                  <button className="ghost-button reset-button" type="button" onClick={resetCalculator}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="subject-head">
                <span>Subject</span>
                <span>Credits</span>
                <span>Grade</span>
                <span>Pts</span>
                <span>-</span>
              </div>

              <div className="subject-list">
                {activeSubjects.map((subject, index) => {
                  const credits = toCredit(subject.credits);
                  const weighted = credits * gradePointFor(subject.grade);

                  return (
                    <div className="subject-row" key={subject.id}>
                      <label className="input-group subject-name">
                        <span>Subject</span>
                        <input
                          value={subject.name}
                          placeholder={`Subject ${index + 1}`}
                          onChange={(event) => updateSubject(activeSemester.id, subject.id, 'name', event.target.value)}
                        />
                      </label>
                      <label className="input-group">
                        <span>Credits</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          value={subject.credits}
                          placeholder="3"
                          onChange={(event) =>
                            updateSubject(activeSemester.id, subject.id, 'credits', event.target.value)
                          }
                        />
                      </label>
                      <label className="input-group">
                        <span>Grade</span>
                        <select
                          value={subject.grade}
                          onChange={(event) => updateSubject(activeSemester.id, subject.id, 'grade', event.target.value)}
                        >
                          {GRADES.map((grade) => (
                            <option key={grade.label} value={grade.label}>
                              {grade.label} - {GRADE_NAMES[grade.label]} ({grade.points})
                            </option>
                          ))}
                        </select>
                      </label>
                      <output>{formatNumber(weighted, 0)}</output>
                      <button
                        className="remove-button"
                        type="button"
                        aria-label={`Remove ${subject.name || `subject ${index + 1}`}`}
                        onClick={() => removeSubject(subject.id)}
                        disabled={activeSubjects.length === 1}
                        title="Remove subject"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
                          <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12Z" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              <button className="add-subject-button" type="button" onClick={addSubject}>
                + Add Subject
              </button>
            </section>

            <ResultCard
              label="SGPA result"
              value={activeResult.sgpa}
              badge={performanceFor(activeResult.sgpa)}
              credits={activeResult.credits}
              weightedPoints={activeResult.weightedPoints}
              onSave={saveSnapshot}
              status={status}
              onShare={handleShare}
            />
          </section>
        )}

        {activeTab === 'cgpa' && (
          <section className="work-grid">
            <section className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <p className="kicker">CGPA semesters</p>
                  <h2>Weighted semester list</h2>
                </div>
                <button className="primary-button" type="button" onClick={addSemester}>
                  Add Semester
                </button>
              </div>

              <div className="semester-list">
                {semesterResults.map((semester) => (
                  <button
                    key={semester.id}
                    className={`semester-pill ${semester.id === activeSemester.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setActiveSemesterId(semester.id);
                      setActiveTab('sgpa');
                    }}
                  >
                    <span>{semester.label || 'Untitled semester'}</span>
                    <strong>{formatNumber(semester.result.sgpa)}</strong>
                    <small>{formatNumber(semester.result.credits, 1)} credits</small>
                  </button>
                ))}
              </div>
            </section>

            <ResultCard
              label="CGPA result"
              value={cgpaSummary.cgpa}
              badge={performanceFor(cgpaSummary.cgpa)}
              credits={cgpaSummary.totalCredits}
              weightedPoints={cgpaSummary.totalWeightedPoints}
              percentage={cgpaSummary.percentage}
              onSave={saveSnapshot}
              status={status}
              onShare={handleShare}
            />
          </section>
        )}

        {activeTab === 'history' && (
          <section className="panel history-panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">History</p>
                <h2>Saved to this browser</h2>
              </div>
              <button className="ghost-button" type="button" onClick={clearSavedHistory} disabled={!history.length}>
                Clear
              </button>
            </div>

            <div className="user-chip" title={userId}>
              Anonymous ID: {userId}
            </div>

            <div className="history-list">
              {history.length === 0 ? (
                <p className="empty-state">Saved SGPA and CGPA snapshots will appear here for this browser.</p>
              ) : (
                history.slice(0, 10).map((item) => (
                  <article className="history-item" key={item.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <strong>{item.label}</strong>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      <button 
                        className="ghost-button" 
                        style={{ minHeight: '32px', padding: '0 12px', fontSize: '0.8rem' }}
                        type="button" 
                        onClick={() => removeSavedHistoryItem(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                    <div className="history-values">
                      <span>SGPA {formatNumber(item.sgpa)}</span>
                      <span>CGPA {formatNumber(item.cgpa)}</span>
                      <span>{formatNumber(item.percentage)}%</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        <section className="analytics-grid">
          <GpaGrowthGraph semesters={semesterResults} />
          <CgpaPredictor cgpaSummary={cgpaSummary} />
        </section>

        <SEOSection />

        <footer className="formula-note">
          <span>Built for JNTUH students.</span>
          <span>Credit and formula based on R22 / R18 / R16 norms.</span>
          <span>SGPA and CGPA are weighted by credits.</span>
        </footer>
      </main>
      <Analytics />
      <SpeedInsights debug={true} />
    </>
  );
}

function SEOSection() {
  return (
    <section className="seo-content">
      <div className="seo-grid">
        <article className="seo-card">
          <h2>How to Calculate JNTUH SGPA?</h2>
          <p>
            To calculate your SGPA (Semester Grade Point Average) for JNTUH, you need to multiply the grade points obtained in each subject by the credits assigned to that subject. Sum these values for all subjects and divide by the total number of credits for the semester.
          </p>
          <div className="formula-box">
            <code>SGPA = Σ(Credits × Grade Points) / Σ(Credits)</code>
          </div>
        </article>

        <article className="seo-card">
          <h2>Converting CGPA to Percentage</h2>
          <p>
            As per the latest JNTUH R22, R18, and R16 regulations, the formula to convert your CGPA to an equivalent percentage is:
          </p>
          <div className="formula-box">
            <code>Percentage (%) = (CGPA - 0.5) × 10</code>
          </div>
          <p className="note">Note: This formula is valid for CGPA ≥ 0.5.</p>
        </article>

        <article className="seo-card">
          <h2>R22, R18, and R16 Compatibility</h2>
          <p>
            While the basic calculation remains the same, each regulation (R22, R18, R16) has different total credit requirements and grading scales. Our calculator is designed to be compatible with all major JNTUH B.Tech regulations, ensuring accuracy for students across different batches.
          </p>
        </article>

        <article className="seo-card">
          <h2>Why use this JNTUH CGPA Calculator?</h2>
          <ul>
            <li><strong>Accuracy:</strong> Built specifically for JNTUH students based on university norms.</li>
            <li><strong>Persistence:</strong> Your data is saved locally on your device for future reference.</li>
            <li><strong>Growth Graph:</strong> Visualize your academic progress across semesters.</li>
            <li><strong>Predictor:</strong> Estimate your future CGPA with our built-in tool.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function ResultCard({ label, value, badge, credits, weightedPoints, percentage, onSave, status, onShare }) {
  return (
    <aside className="panel result-card">
      <div className="result-kicker">
        <p className="kicker">{label}</p>
        <span aria-hidden="true">spark</span>
      </div>
      <div className="big-result">
        <strong>{formatNumber(value)}</strong>
        <span>/ 10</span>
      </div>
      <span className="badge">{badge}</span>
      <div className="result-stats">
        <div>
          <span>Total credits</span>
          <strong>{formatNumber(credits, 1)}</strong>
        </div>
        <div>
          <span>Weighted pts</span>
          <strong>{formatNumber(weightedPoints)}</strong>
        </div>
        {typeof percentage === 'number' && (
          <div>
            <span>Percentage</span>
            <strong>{formatNumber(percentage)}%</strong>
          </div>
        )}
      </div>
      <button className="primary-button full" type="button" onClick={onSave}>
        Save to History
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <button className="ghost-button full" type="button" onClick={() => window.print()}>
          Print
        </button>
        <button className="ghost-button full" type="button" onClick={onShare}>
          Share
        </button>
      </div>
      {status && <p className="status">{status}</p>}
    </aside>
  );
}

createRoot(document.getElementById('root')).render(<App />);
