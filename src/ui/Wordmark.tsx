/** RIFT with its full stop as a small flame: the brand's one spark of fire. */
export function Wordmark({ onClick }: { onClick?: () => void }) {
  const mark = (
    <>
      RIFT
      <span className="ember" aria-hidden>
        <i className="flame outer" />
        <i className="flame inner" />
        <i className="spark" />
      </span>
    </>
  )
  return onClick
    ? <button className="wordmark link" onClick={onClick} title="Back to the campus map" aria-label="RIFT, back to the campus map">{mark}</button>
    : <span className="wordmark" aria-label="RIFT">{mark}</span>
}
