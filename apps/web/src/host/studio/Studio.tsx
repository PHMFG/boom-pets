import { useEffect, useRef, useState } from 'react';
import { PET_CLIPS, PET_IDS, type PetClip, type PetId } from '../../shared/pets';
import { strings } from '../../shared/strings.pt-BR';
import { StudioStage } from './StudioStage';
import './studio.css';

type Status = { kind: 'loading' } | { kind: 'ready'; count: number } | { kind: 'failed'; detail: string };

/** Test bench: every pet and every shipped clip, plus the 3D font, on one screen. */
export function Studio() {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const stage = useRef<StudioStage | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [clip, setClip] = useState<PetClip>('idle');
  const [focus, setFocus] = useState<PetId | null>(null);
  const [spin, setSpin] = useState(false);
  const [words, setWords] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const created = new StudioStage(host.current);
    stage.current = created;
    // Layout size, not the on-screen box: the panel is mid pop-in animation at this point.
    if (panel.current) created.setLeftInset(panel.current.offsetLeft + panel.current.offsetWidth);
    let alive = true;
    created.load().then(
      count => alive && setStatus({ kind: 'ready', count }),
      (error: unknown) => alive && setStatus({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
      stage.current = null;
      created.dispose();
    };
  }, []);

  useEffect(() => stage.current?.setClip(clip), [clip]);
  useEffect(() => stage.current?.focus(focus), [focus]);
  useEffect(() => stage.current?.setSpin(spin), [spin]);
  useEffect(() => stage.current?.setWordsVisible(words), [words]);

  const text = strings.studio;
  return (
    <main className="studio">
      <div ref={host} className="studio-stage" />
      <aside ref={panel} className="studio-panel sticker">
        <h1>{text.title}</h1>
        <p className={`studio-status is-${status.kind}`} role="status">
          {status.kind === 'loading' && text.loading}
          {status.kind === 'ready' && text.loaded(status.count)}
          {status.kind === 'failed' && `${text.failed} ${status.detail}`}
        </p>

        <div className="studio-grid two">
          {PET_CLIPS.map(name => (
            <button key={name} className="button" aria-pressed={clip === name} onClick={() => setClip(name)}>
              {text.clips[name]}
            </button>
          ))}
        </div>

        <div className="studio-grid two">
          <button className="button" aria-pressed={spin} onClick={() => setSpin(value => !value)}>
            {text.spin}
          </button>
          <button className="button" aria-pressed={words} onClick={() => setWords(value => !value)}>
            {text.text3d}
          </button>
        </div>

        <div className="studio-grid three">
          <button className="button small" aria-pressed={focus === null} onClick={() => setFocus(null)}>
            {text.allPets}
          </button>
          {PET_IDS.map(id => (
            <button key={id} className="button small" aria-pressed={focus === id} onClick={() => setFocus(id)}>
              {strings.pets[id]}
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}
