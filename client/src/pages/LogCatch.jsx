import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { resizeImage, toLocalInput } from '../util.js';
import { ScoreBadge } from '../components/CatchCard.jsx';

const emptyForm = () => ({ species: '', weight: '', length: '', caughtAt: toLocalInput(new Date()), location: '' });

export default function LogCatch() {
  const { user } = useAuth();
  const [rules, setRules] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null); // live score estimate
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { api.rules().then(setRules).catch((e) => setError(e.message)); }, []);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  const species = rules?.species.find((s) => s.name === form.species);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live score preview (debounced)
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    const w = Number(form.weight), l = Number(form.length);
    if (!form.species || !(w > 0) || !(l > 0)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api.preview(form.species, w, l)
        .then((r) => !cancelled && setPreview(r.score))
        .catch((e) => !cancelled && setPreviewError(e.message));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.species, form.weight, form.length]);

  async function submit(e) {
    e.preventDefault();
    if (rules.requirePhoto && !photo) return setError('Please add a photo of your catch');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('species', form.species);
      fd.append('weightLbs', form.weight);
      fd.append('lengthIn', form.length);
      fd.append('caughtAt', new Date(form.caughtAt).toISOString());
      fd.append('location', form.location);
      if (photo) fd.append('photo', await resizeImage(photo), 'catch.jpg');
      setResult((await api.logCatch(fd)).catch);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setForm(emptyForm());
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (result) {
    const { base, weightBonus, lengthBonus, total } = result.score;
    return (
      <div className="page narrow">
        <div className="card success">
          <div className="empty-emoji">🎉</div>
          <h1>Nice catch!</h1>
          <p className="muted">{result.species} · {result.weightLbs} lb · {result.lengthIn} in</p>
          <ScoreBadge points={total} big />
          <p className="muted small">Base {base} + weight {weightBonus} + length {lengthBonus}</p>
          <div className="row">
            <button className="btn btn-primary" onClick={reset}>Log another</button>
            <Link className="btn btn-ghost" to={`/u/${user.username}`}>My profile</Link>
            <Link className="btn btn-ghost" to="/leaderboard">Leaderboard</Link>
          </div>
        </div>
      </div>
    );
  }

  const maxDate = toLocalInput(new Date());
  const minDate = toLocalInput(new Date(Date.now() - (rules?.maxBackdateDays ?? 7) * 86400000));

  return (
    <div className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h1>Log a catch</h1>

        <label>
          Species
          <select value={form.species} onChange={set('species')} required>
            <option value="" disabled>Choose a species…</option>
            {['trophy', 'rare', 'uncommon', 'common'].map((tier) => (
              <optgroup key={tier} label={tier[0].toUpperCase() + tier.slice(1)}>
                {rules?.species.filter((s) => s.rarity === tier).map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {species && (
            <span className="hint">
              {species.rarity} · {species.basePoints} base pts · typical {species.typicalWeight} lb / {species.typicalLength} in
            </span>
          )}
        </label>

        <div className="grid-2">
          <label>
            Weight (lbs)
            <input type="number" inputMode="decimal" step="0.01" min="0.01" value={form.weight} onChange={set('weight')} required />
          </label>
          <label>
            Length (in)
            <input type="number" inputMode="decimal" step="0.1" min="0.1" value={form.length} onChange={set('length')} required />
          </label>
        </div>

        <label>
          Date &amp; time
          <input type="datetime-local" value={form.caughtAt} onChange={set('caughtAt')} min={minDate} max={maxDate} required />
        </label>

        <label>
          <span>Location <span className="muted">(optional)</span></span>
          <input value={form.location} onChange={set('location')} maxLength={100} placeholder="Lake, river, or spot name" />
        </label>

        <div className="field">
          <span className="label">Photo {rules?.requirePhoto ? '' : <span className="muted">(optional)</span>}</span>
          <input ref={fileRef} id="photo" type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files[0] ?? null)} />
          {photoUrl ? (
            <div className="photo-preview">
              <img src={photoUrl} alt="Selected catch" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPhoto(null); fileRef.current.value = ''; }}>Remove</button>
            </div>
          ) : (
            <label htmlFor="photo" className="dropzone">📷 Take or choose a photo</label>
          )}
        </div>

        <div className="preview-box" aria-live="polite">
          {preview ? (
            <>
              <ScoreBadge points={preview.total} />
              <div>
                <strong>Estimated score</strong>
                <div className="small muted">Base {preview.base} + weight {preview.weightBonus} + length {preview.lengthBonus}</div>
              </div>
            </>
          ) : (
            <span className={previewError ? 'error' : 'muted small'}>
              {previewError || 'Pick a species and enter weight and length to see your score.'}
            </span>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary block" disabled={busy || !rules}>{busy ? 'Logging…' : 'Log catch'}</button>
      </form>
    </div>
  );
}
