import { label, tone } from '../format';

export function Badge({ value }) {
  return <span className={`badge ${tone(value)}`}>{label(value)}</span>;
}

export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h2>{title}</h2>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }) {
  return <p className="muted">{text}</p>;
}

export function ErrorText({ error }) {
  if (!error) return null;
  return <div className="error" role="alert">{error}</div>;
}
