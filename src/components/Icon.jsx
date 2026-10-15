const PATHS = {
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11A2.5 2.5 0 0 0 20 17.5V15',
  download: 'M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 17v.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V17',
  archive: 'M3 7h18M3 7v11.5A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5V7M3 7l1.7-2.4A1.5 1.5 0 0 1 5.9 4h12.2a1.5 1.5 0 0 1 1.2.6L21 7M10 11h4',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  alert: 'M12 8.5v5m0 3.5v.2M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z',
  image: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Zm0 10L8.5 11l4 4.5L15.5 13l4.5 4M9 9.5h.2',
  stop: 'M7.5 7.5h9v9h-9z',
  plus: 'M12 5v14M5 12h14',
  shield: 'M12 3.5 5 6v5.5c0 4 2.9 7.4 7 8.9 4.1-1.5 7-4.9 7-8.9V6l-7-2.5Z',
  bolt: 'M13.5 3 6 13.5h4.5L10 21l7.5-10.5H13l.5-7.5Z',
  trash: 'M4.5 7h15M9.5 7V4.8A.8.8 0 0 1 10.3 4h3.4a.8.8 0 0 1 .8.8V7M6.5 7l.8 12.3a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  grip: 'M9.5 8.5 6.5 12l3 3.5M14.5 8.5l3 3.5-3 3.5',
  clock: 'M12 7.5V12l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
}

export default function Icon({ name, size = 18, className }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}
