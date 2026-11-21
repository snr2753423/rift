const PATHS = {
  pointer: 'M5 3l14 7-6 2-2 6z',
  fire: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z',
  obstacle: 'M4 4h16v16H4z M4 20L20 4',
  block: 'M5 21V4h9v17 M3 21h13 M17 9l4 4 M21 9l-4 4',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14 M16 5v14',
  restart: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden><path d={PATHS[name]} /></svg>
}
