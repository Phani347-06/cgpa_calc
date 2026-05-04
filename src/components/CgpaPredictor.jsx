import React, { useEffect, useMemo, useState } from 'react';

const clampDisplay = (value) => {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

const readNumber = (value) => {
  if (String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function CgpaPredictor({ cgpaSummary }) {
  const [currentCgpa, setCurrentCgpa] = useState('');
  const [completedCredits, setCompletedCredits] = useState('');
  const [targetCgpa, setTargetCgpa] = useState('');
  const [nextCredits, setNextCredits] = useState('');
  const [whatIfSgpa, setWhatIfSgpa] = useState('');

  useEffect(() => {
    setCurrentCgpa(cgpaSummary.cgpa ? cgpaSummary.cgpa.toFixed(2) : '');
    setCompletedCredits(cgpaSummary.totalCredits ? String(Number(cgpaSummary.totalCredits.toFixed(1))) : '');
  }, [cgpaSummary.cgpa, cgpaSummary.totalCredits]);

  const prediction = useMemo(() => {
    const current = readNumber(currentCgpa);
    const completed = readNumber(completedCredits);
    const target = readNumber(targetCgpa);
    const next = readNumber(nextCredits);

    if (current === null || completed === null || target === null || next === null) {
      return null;
    }

    if (current <= 0 || completed <= 0 || target <= 0 || next <= 0 || current > 10 || target > 10) {
      return null;
    }

    const currentWeightedPoints = current * completed;
    const totalFutureCredits = completed + next;
    const requiredSgpa = (target * totalFutureCredits - currentWeightedPoints) / next;

    return {
      requiredSgpa,
      possible: requiredSgpa >= 0 && requiredSgpa <= 10,
      bestPossibleCgpa: (currentWeightedPoints + 10 * next) / totalFutureCredits,
    };
  }, [currentCgpa, completedCredits, targetCgpa, nextCredits]);

  const whatIf = useMemo(() => {
    const current = readNumber(currentCgpa);
    const completed = readNumber(completedCredits);
    const next = readNumber(nextCredits);
    const hypothetical = readNumber(whatIfSgpa);

    if (current === null || completed === null || next === null || hypothetical === null) {
      return null;
    }

    if (current <= 0 || completed <= 0 || next <= 0 || hypothetical < 0 || hypothetical > 10 || current > 10) {
      return null;
    }

    const resultingCgpa = (current * completed + hypothetical * next) / (completed + next);
    return {
      hypothetical,
      resultingCgpa,
    };
  }, [currentCgpa, completedCredits, nextCredits, whatIfSgpa]);

  return (
    <section className="panel analytics-card predictor-card">
      <div className="analytics-heading">
        <div>
          <p className="kicker">CGPA predictor</p>
          <h2>Target planning</h2>
        </div>
      </div>

      <div className="predictor-grid">
        <label className="input-group">
          <span>Current CGPA</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.01"
            value={currentCgpa}
            onChange={(event) => setCurrentCgpa(event.target.value)}
            placeholder="8.20"
          />
        </label>
        <label className="input-group">
          <span>Completed credits</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={completedCredits}
            onChange={(event) => setCompletedCredits(event.target.value)}
            placeholder="80"
          />
        </label>
        <label className="input-group">
          <span>Target CGPA</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.01"
            value={targetCgpa}
            onChange={(event) => setTargetCgpa(event.target.value)}
            placeholder="8.80"
          />
        </label>
        <label className="input-group">
          <span>Next sem credits</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={nextCredits}
            onChange={(event) => setNextCredits(event.target.value)}
            placeholder="21"
          />
        </label>
      </div>

      <div className="prediction-output">
        <span>Required SGPA</span>
        <strong>{prediction ? clampDisplay(prediction.requiredSgpa) : '--'}</strong>
        {prediction && (
          <small>
            {prediction.possible
              ? 'This target is possible within the 10-point scale.'
              : `This target needs more than 10 SGPA. Even with 10.00 SGPA, your CGPA becomes ${clampDisplay(
                  prediction.bestPossibleCgpa,
                )}.`}
          </small>
        )}
      </div>

      <label className="input-group what-if-input">
        <span>What-if next SGPA</span>
        <input
          type="number"
          min="0"
          max="10"
          step="0.01"
          value={whatIfSgpa}
          onChange={(event) => setWhatIfSgpa(event.target.value)}
          placeholder="9.00"
        />
      </label>

      <p className="what-if-message">
        {whatIf
          ? `If you score ${clampDisplay(whatIf.hypothetical)} SGPA, your CGPA becomes ${clampDisplay(
              whatIf.resultingCgpa,
            )}.`
          : 'Enter a hypothetical SGPA to simulate your next CGPA.'}
      </p>
    </section>
  );
}
