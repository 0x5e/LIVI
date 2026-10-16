import { Box } from '@mui/material'

export function initials(label: string): string {
  const words = label.split(/[\s\-_.]+/).filter((w) => w.length > 0)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** A steady colour per name, so a station keeps its tile colour. */
export function hue(label: string): number {
  let h = 0
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

type Props = {
  label: string
  /** Base64 image data, the station's logo. */
  image?: string | null
  size: number
}

export const StationBadge = ({ label, image, size }: Props) => {
  const common = {
    width: size,
    height: size,
    borderRadius: `${Math.round(size * 0.18)}px`,
    flex: 'none'
  }
  if (image) {
    const mime = image.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
    return (
      <Box
        component="img"
        src={`data:${mime};base64,${image}`}
        alt={label}
        sx={{ ...common, objectFit: 'contain', background: '#fff' }}
      />
    )
  }
  return (
    <Box
      aria-label={label}
      sx={{
        ...common,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: Math.round(size * 0.36),
        color: '#fff',
        background: `hsl(${hue(label)} 45% 38%)`
      }}
    >
      {initials(label)}
    </Box>
  )
}
