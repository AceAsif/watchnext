import React, { useEffect, useState } from 'react';
import { img } from '../api/tmdb.js';
import { Sheet } from './ui.jsx';
import { renderFinishImage } from './finishCardRender.js';
import { finishFacts, bulkMinutes, finishShareLine, finishFileName } from './finishCardLogic.js';
import { loadImg, canvasToBlob, downloadBlob, shareImageFile } from './shareImage.js';

// "You finished <show>": a preview of the share card with Share and Save image.
// Mounted only while open, so the card is drawn from the show as it is right now.
export default function FinishCardSheet({ show, allShows, onClose }) {
  const [card, setCard] = useState({ status: 'loading' }); // loading | ready | error
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    let url = null;
    (async () => {
      try {
        const facts = finishFacts(show, bulkMinutes(allShows));
        const canvas = await renderFinishImage(facts, { loadImg, posterUrl: (p) => img(p, 'w500') });
        const blob = await canvasToBlob(canvas);
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setCard({ status: 'ready', url, blob, facts });
      } catch (e) {
        console.error('Finish card failed', e);
        if (alive) setCard({ status: 'error', message: e && e.message ? e.message : 'unknown error' });
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = card.status === 'ready';
  const share = async () => {
    const res = await shareImageFile({ blob: card.blob, filename: finishFileName(card.facts), title: 'WatchNext', text: finishShareLine(card.facts) });
    if (res === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };

  return (
    <Sheet open title={`You finished ${show.name}`} onClose={onClose}>
      {card.status === 'loading' && <p className="sd-fc-note" role="status">Making your card…</p>}
      {card.status === 'error' && <p className="sd-fc-note err" role="alert">Sorry, the card could not be made ({card.message}).</p>}
      {ready && <img className="sd-fc-preview" src={card.url} alt={`Share card: you finished ${show.name}`} width="1080" height="1350" />}
      <div className="sd-yir-actions" style={{ marginTop: 14 }}>
        <button type="button" className="sd-btn primary" disabled={!ready} onClick={share}>{copied ? 'Copied!' : 'Share'}</button>
        <button type="button" className="sd-btn" disabled={!ready} onClick={() => downloadBlob(card.blob, finishFileName(card.facts))}>Save image</button>
      </div>
    </Sheet>
  );
}
