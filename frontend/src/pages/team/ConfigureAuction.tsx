import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { AuctionFormat, AuctionTemplate, PrThread, Vendor } from '../../types';
import { fmtINR } from '../../utils/format';

// Must mirror UpdateEnglishConfigDto / UpdateJapaneseConfigDto exactly.
// The team-state snapshot the config form is seeded from also carries
// read-only/computed fields (currentEndsAt, extensionsUsed, tickToken,
// ...) that the PATCH endpoint's ValidationPipe rejects outright
// (forbidNonWhitelisted: true, a deliberate spec §12 choice) — so the
// save must pick only the editable subset rather than echo the whole object back.
const ENGLISH_EDITABLE_FIELDS = [
  'ceilingPrice', 'decrementType', 'decrementValue', 'durationSec', 'autoExtend',
  'triggerWindowSec', 'extensionLengthSec', 'maxExtensions', 'visibility', 'reservePrice', 'tieBreakRule',
] as const;
const JAPANESE_EDITABLE_FIELDS = [
  'startingPrice', 'floorPrice', 'tickDecrement', 'tickIntervalSec',
  'responseWindowSec', 'autoDrop', 'minVendorsRemaining',
] as const;

function pick(obj: any, keys: readonly string[]) {
  const out: any = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}

// Client-side starting values only, so the form isn't blank before a draft
// exists server-side (mirrors AuctionsService's own defaults) — every
// field stays fully editable and gets sent to the server on create.
const DEFAULT_ENGLISH = {
  ceilingPrice: 1000000,
  decrementType: 'absolute',
  decrementValue: 5000,
  durationSec: 900,
  autoExtend: true,
  triggerWindowSec: 45,
  extensionLengthSec: 45,
  maxExtensions: 3,
  visibility: 'full',
  tieBreakRule: 'earliest',
};
const DEFAULT_JAPANESE = {
  startingPrice: 1000000,
  floorPrice: 800000,
  tickDecrement: 20000,
  tickIntervalSec: 15,
  responseWindowSec: 10,
  autoDrop: true,
  minVendorsRemaining: 2,
};

type Draft = {
  id: string;
  format: AuctionFormat;
  invitees: { vendorId: string; isActive: boolean }[];
  configEnglish?: any;
  configJapanese?: any;
};

export default function ConfigureAuction() {
  const { threadId, auctionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [thread, setThread] = useState<PrThread | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<AuctionFormat>('english');
  const [eng, setEng] = useState<any>(DEFAULT_ENGLISH);
  const [jap, setJap] = useState<any>(DEFAULT_JAPANESE);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<AuctionTemplate[]>([]);

  useEffect(() => {
    api.get<AuctionTemplate[]>('/api/auctions/templates').then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // "Copy from a previous auction" — pre-fills every editable field from a
  // real, previously-saved config row (never a synthesized default). Price
  // fields come along too, same as a literal copy — the team edits
  // whatever differs for the new item afterward.
  function applyTemplate(auctionId: string) {
    const t = templates.find((x) => x.auctionId === auctionId);
    if (!t) return;
    setFormat(t.format);
    if (t.format === 'english' && t.english) setEng({ ...DEFAULT_ENGLISH, ...t.english });
    if (t.format === 'japanese' && t.japanese) setJap({ ...DEFAULT_JAPANESE, ...t.japanese });
  }

  // Switching format pre-draft resets to that format's defaults, same as
  // the prototype's setFormat() — post-draft the format is fixed (set at
  // creation time) so this toggle isn't shown any more.
  function chooseFormat(f: AuctionFormat) {
    setFormat(f);
    if (f === 'english') setEng(DEFAULT_ENGLISH);
    else setJap(DEFAULT_JAPANESE);
  }

  // Route can arrive either as /auctions/new/:threadId (no auction yet) or
  // /auctions/:auctionId/configure (draft already created).
  useEffect(() => {
    (async () => {
      try {
        if (threadId) {
          const t = await api.get<PrThread>(`/api/threads/${threadId}`);
          setThread(t);
        } else if (auctionId) {
          // No direct GET-config endpoint in the spec's REST table — pull
          // the current config back out of the team state snapshot instead.
          const state = await api.get<any>(`/api/auctions/${auctionId}/state`);
          setThread({ id: state.id, threadCode: state.threadCode, title: state.title } as any);
          setFormat(state.format);
          if (state.format === 'english') setEng(state.config);
          else setJap(state.config);
          setSelected(new Set(state.invitees.map((i: any) => i.vendorId)));
        }
      } catch (err) {
        toast('Could not load auction', err instanceof ApiError ? err.message : undefined, 'twarn');
      }
    })();
  }, [threadId, auctionId]);

  function toggleVendor(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Single continuous action from the team's point of view — picks format,
  // vendors, and every config field on one screen, then create+configure
  // happen together as one click (two API calls under the hood: the spec's
  // REST contract splits "create draft" from "PATCH config", but there's
  // no reason to make the team see that as two separate screens/steps).
  async function createDraft() {
    if (!thread) return;
    setBusy(true);
    try {
      const created = await api.post<Draft>('/api/auctions', {
        prThreadId: thread.id,
        format,
        inviteeVendorIds: [...selected],
      });
      await api.patch(`/api/auctions/${created.id}/config`, {
        english: format === 'english' ? pick(eng, ENGLISH_EDITABLE_FIELDS) : undefined,
        japanese: format === 'japanese' ? pick(jap, JAPANESE_EDITABLE_FIELDS) : undefined,
      });
      navigate(`/auctions/${created.id}/configure`, { replace: true });
    } catch (err) {
      toast('Could not create draft', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    if (!auctionId) return;
    setBusy(true);
    try {
      await api.patch(`/api/auctions/${auctionId}/config`, {
        english: format === 'english' ? pick(eng, ENGLISH_EDITABLE_FIELDS) : undefined,
        japanese: format === 'japanese' ? pick(jap, JAPANESE_EDITABLE_FIELDS) : undefined,
        inviteeVendorIds: [...selected],
      });
      toast('Saved', undefined, 'tgood');
    } catch (err) {
      toast('Could not save', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  async function goLive() {
    if (!auctionId) return;
    setBusy(true);
    try {
      await saveConfig();
      await api.post(`/api/auctions/${auctionId}/go-live`);
      navigate(`/auctions/${auctionId}/live`);
    } catch (err) {
      toast('Could not go live', err instanceof ApiError ? err.message : undefined, 'twarn');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    api.get<Vendor[]>('/api/vendors').then(setVendors).catch(() => setVendors([]));
  }, []);

  if (!thread) return <Shell wide>Loading…</Shell>;

  return (
    <Shell wide>
      <button className="back-link" onClick={() => navigate('/desk')}>
        ← Auction Desk
      </button>
      <div className="page-head">
        <div>
          <h1>Configure — {thread.title}</h1>
          <div className="lede">{thread.threadCode}</div>
        </div>
      </div>

      <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        <div>
          {!auctionId && (
            <div className="panel">
              <h3>Auction format</h3>
              <div className="panel-sub">Choose the format — the fields below update to match.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={format === 'english' ? 'btn btn-dark' : 'btn btn-secondary'}
                  onClick={() => chooseFormat('english')}
                >
                  English Reverse
                </button>
                <button
                  type="button"
                  className={format === 'japanese' ? 'btn btn-dark' : 'btn btn-secondary'}
                  onClick={() => chooseFormat('japanese')}
                >
                  Japanese Descending Clock
                </button>
              </div>

              {templates.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
                  <label style={{ fontSize: 12, fontWeight: 500 }}>Copy from a previous auction</label>
                  <div className="hint" style={{ marginBottom: 6 }}>Pre-fills every field below from a past auction's saved config — edit whatever differs.</div>
                  <select defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
                    <option value="">— Select a previous auction —</option>
                    {templates.map((t) => (
                      <option key={t.auctionId} value={t.auctionId}>
                        {t.threadCode} — {t.title} ({t.format === 'english' ? 'English Reverse' : 'Japanese Clock'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {format === 'english' && <EnglishForm value={eng} onChange={setEng} />}
          {format === 'japanese' && <JapaneseForm value={jap} onChange={setJap} />}

          <div className="panel">
            <h3>Invited vendors</h3>
            <div className="panel-sub">
              {auctionId
                ? 'Uncheck to exclude a vendor from this auction specifically.'
                : 'Select vendors to invite, then create the draft.'}
            </div>
            <div className="invitee-list">
              {vendors.map((v) => (
                <label key={v.id} style={{ display: 'flex', gap: 11, padding: '10px 4px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center' }}>
                  <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleVendor(v.id)} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v.companyName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{v.city}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="side-summary" style={{ position: 'sticky', top: 78 }}>
          <div className="panel">
            <h3>Ready to go live</h3>
            <div className="panel-sub">Go-live is immediate — there is no separate scheduled start.</div>
            <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12.5 }}>
              <span>Format</span>
              <span className="mono">{format === 'english' ? 'English Reverse' : 'Japanese Clock'}</span>
            </div>
            <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12.5 }}>
              <span>{format === 'english' ? 'Ceiling price' : 'Starting price'}</span>
              <span className="mono">{fmtINR(format === 'english' ? eng.ceilingPrice : jap.startingPrice)}</span>
            </div>
            <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12.5 }}>
              <span>Invited vendors</span>
              <span className="mono">{selected.size}</span>
            </div>

            {!auctionId ? (
              <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={busy || selected.size < 1} onClick={createDraft}>
                Create draft
              </button>
            ) : (
              <>
                <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} disabled={busy} onClick={saveConfig}>
                  Save config
                </button>
                <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={busy || selected.size < 1} onClick={goLive}>
                  Go live now
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function NumField({ label, hint, value, onChange, prefix }: { label: string; hint?: string; value: any; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div className="field">
      <label>
        {label} {hint && <span className="hint">{hint}</span>}
      </label>
      <div className={prefix ? 'input-prefix' : undefined}>
        {prefix && <span>{prefix}</span>}
        <input type="number" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}

function EnglishForm({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="panel">
      <h3>Price &amp; decrement</h3>
      <div className="panel-sub">Ceiling price is visible to every vendor throughout (BR-07).</div>
      <div className="field-row">
        <NumField label="Ceiling price" prefix="₹" value={value.ceilingPrice} onChange={(v) => set('ceilingPrice', v)} />
        <NumField label="Hidden reserve price" hint="— internal only, never sent to vendors" prefix="₹" value={value.reservePrice} onChange={(v) => set('reservePrice', v)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Decrement type</label>
          <select value={value.decrementType ?? 'absolute'} onChange={(e) => set('decrementType', e.target.value)}>
            <option value="absolute">Absolute (₹)</option>
            <option value="percentage">Percentage (%)</option>
          </select>
        </div>
        <NumField label="Minimum decrement" value={value.decrementValue} onChange={(v) => set('decrementValue', v)} />
      </div>
      <div className="callout info">
        Every accepted bid, including the vendor's first, must undercut by at least this decrement from the ceiling
        or their own last bid — no exceptions.
      </div>
      <div className="field-row" style={{ marginTop: 14 }}>
        <NumField label="Duration (sec)" value={value.durationSec} onChange={(v) => set('durationSec', v)} />
        <div className="field">
          <label>Ranking visibility to vendors</label>
          <select value={value.visibility ?? 'full'} onChange={(e) => set('visibility', e.target.value)}>
            <option value="full">Full price &amp; rank (competitors shown as Bidder A/B/C)</option>
            <option value="rank_only">Rank only</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Tie-break rule</label>
        <select value={value.tieBreakRule ?? 'earliest'} onChange={(e) => set('tieBreakRule', e.target.value)}>
          <option value="earliest">Earliest bid at that price retains rank</option>
          <option value="manual">Flag for manual review</option>
        </select>
      </div>
      <div className="toggle-row">
        <div className="tlabel">
          <b>Anti-sniping auto-extension</b>
          <span>Extends the clock if a bid lands inside the trigger window</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={!!value.autoExtend} onChange={(e) => set('autoExtend', e.target.checked)} />
          <span className="slider" />
        </label>
      </div>
      {value.autoExtend && (
        <>
          <div className="field-row" style={{ marginTop: 10 }}>
            <NumField label="Trigger window (sec before close)" value={value.triggerWindowSec} onChange={(v) => set('triggerWindowSec', v)} />
            <NumField label="Extension length (sec)" value={value.extensionLengthSec} onChange={(v) => set('extensionLengthSec', v)} />
          </div>
          <NumField label="Max extensions" value={value.maxExtensions} onChange={(v) => set('maxExtensions', v)} />
        </>
      )}
    </div>
  );
}

function JapaneseForm({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="panel">
      <h3>Price &amp; ticks</h3>
      <div className="panel-sub">Starting and floor price are visible to vendors throughout.</div>
      <div className="field-row">
        <NumField label="Starting price" prefix="₹" value={value.startingPrice} onChange={(v) => set('startingPrice', v)} />
        <NumField label="Floor price" prefix="₹" value={value.floorPrice} onChange={(v) => set('floorPrice', v)} />
      </div>
      <div className="field-row">
        <NumField label="Price decrement per tick" prefix="₹" value={value.tickDecrement} onChange={(v) => set('tickDecrement', v)} />
        <NumField label="Tick interval (sec)" value={value.tickIntervalSec} onChange={(v) => set('tickIntervalSec', v)} />
      </div>
      <div className="field-row">
        <NumField label="Response window (sec)" value={value.responseWindowSec} onChange={(v) => set('responseWindowSec', v)} />
        <NumField label="Minimum vendors to continue" value={value.minVendorsRemaining} onChange={(v) => set('minVendorsRemaining', v)} />
      </div>
      <div className="toggle-row">
        <div className="tlabel">
          <b>Auto-drop on no response</b>
          <span>A vendor who doesn't confirm within the window is dropped at that tick's price</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={!!value.autoDrop} onChange={(e) => set('autoDrop', e.target.checked)} />
          <span className="slider" />
        </label>
      </div>
      {!value.autoDrop && (
        <div className="callout warn">With auto-drop off, a non-response is treated as an implicit Stay.</div>
      )}
      <div className="callout info">
        Closes automatically when the floor price is reached or active vendors fall to the minimum — the minimum
        check applies even on the very first tick.
      </div>
    </div>
  );
}
