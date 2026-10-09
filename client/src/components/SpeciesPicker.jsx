import { useEffect, useMemo, useRef, useState } from 'react';

const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', trophy: 'Trophy', legendary: 'Legendary' };

function RarityTag({ rarity }) {
  return <span className={`rarity-tag rarity-${rarity}`}>{RARITY_LABEL[rarity] ?? rarity}</span>;
}

/** A searchable, grouped (category -> subgroup) species combobox — a plain
 * <select> can't search and is unwieldy past a couple dozen options, and
 * this list has 198+. `species`: flat array of { name, category, subgroup,
 * rarity }, already in display order; a null category (just "Other") is
 * rendered as a single final option outside any group. */
export default function SpeciesPicker({ species, value, onChange, id }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const grouped = useMemo(() => {
    const byCategory = new Map();
    const other = [];
    for (const s of species) {
      if (!s.category) { other.push(s); continue; }
      if (!byCategory.has(s.category)) byCategory.set(s.category, new Map());
      const bySubgroup = byCategory.get(s.category);
      const key = s.subgroup ?? '';
      if (!bySubgroup.has(key)) bySubgroup.set(key, []);
      bySubgroup.get(key).push(s);
    }
    return { byCategory, other };
  }, [species]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return species.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 60);
  }, [species, query]);

  function pick(name) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  function Row({ s, showGroup }) {
    return (
      <li
        role="option"
        aria-selected={s.name === value}
        className={`species-row${s.name === value ? ' selected' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); pick(s.name); }}
      >
        <span className="species-row-name">
          {s.name}
          {showGroup && <span className="muted small"> — {s.category}{s.subgroup ? ` · ${s.subgroup}` : ''}</span>}
        </span>
        <RarityTag rarity={s.rarity} />
      </li>
    );
  }

  return (
    <div className="species-picker" ref={rootRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
        placeholder="Search or choose a species…"
        value={open ? query : value || ''}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
        required
      />
      {open && (
        <div className="species-dropdown card" role="listbox">
          {searchResults ? (
            searchResults.length ? (
              <ul>{searchResults.map((s) => <Row key={`${s.category}|${s.subgroup}|${s.name}`} s={s} showGroup />)}</ul>
            ) : (
              <p className="muted small species-empty">No species match "{query}".</p>
            )
          ) : (
            <>
              {[...grouped.byCategory.entries()].map(([category, bySubgroup]) => (
                <div key={category} className="species-group">
                  <div className="species-group-label">{category}</div>
                  {[...bySubgroup.entries()].map(([subgroup, fish]) => (
                    <div key={subgroup}>
                      {subgroup && <div className="species-subgroup-label">{subgroup}</div>}
                      <ul>{fish.map((s) => <Row key={`${category}|${subgroup}|${s.name}`} s={s} />)}</ul>
                    </div>
                  ))}
                </div>
              ))}
              {grouped.other.length > 0 && (
                <div className="species-group">
                  <ul>{grouped.other.map((s) => <Row key={s.name} s={s} />)}</ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
