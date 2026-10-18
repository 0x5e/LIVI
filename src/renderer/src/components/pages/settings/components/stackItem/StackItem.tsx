import ArrowForwardIosOutlinedIcon from '@mui/icons-material/ArrowForwardIosOutlined'
import Paper from '@mui/material/Paper'
import { styled } from '@mui/material/styles'
import type { SelectNode } from '@renderer/routes/types'
import { useLiviStore } from '@renderer/store/store'
import { StackItemProps } from '@settings/type'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultColorForPath } from '../colorPicker/colorUtils'
import { findOptionForValue, withGhostOption } from '../ghostOption'
import { getCachedOptions, resolveOptions } from '../selectOptionsCache'
import { SettingsRowIcon } from '../settingsRowIcon'

const Item = styled(Paper)(({ theme }) => {
  const activeColor = theme.palette.primary.main

  const rowPad = 'var(--livi-row-pad, 12px)'
  const rowH = 'var(--livi-row-h, 44px)'
  const rowFont = 'clamp(0.9rem, 2.2svh, 1rem)'
  const rowGap = 'var(--livi-row-gap, 16px)'

  const activeRowStyles = {
    '& > a, & > p': { color: activeColor },
    '& .row-chevron': { transform: 'translateX(-3px)', color: activeColor }
  } as const

  return {
    position: 'relative',
    borderRadius: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    gap: rowGap,
    height: rowH,
    paddingRight: rowPad,
    fontSize: rowFont,

    // Inset divider; group ends (rounding, last divider off) are styled by the list container
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 'var(--livi-row-inset, 52px)',
      right: 'var(--livi-row-inset-r, 28px)',
      bottom: 0,
      height: '2px',
      backgroundColor: theme.palette.divider
    },

    '& .row-chevron': {
      transform: 'translateX(0)',
      transition: 'transform 0.3s ease-in-out, color 0.3s ease-in-out'
    },

    // Hover ONLY for real mouse (prevents sticky hover after touch)
    'html[data-input="mouse"] &': {
      '&:hover': activeRowStyles
    },

    // Press feedback (mouse + touch) - same as keyboard highlight
    '&:active': activeRowStyles,

    // Keyboard/D-pad highlight
    '&:focus-visible': {
      outline: 'none',
      ...activeRowStyles
    },

    // IMPORTANT: do not use :focus styling (can stick on touch/click)
    '&:focus': { outline: 'none' },

    ...theme.applyStyles('dark', {
      backgroundColor: 'transparent'
    }),

    '& > p': {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      padding: `0 ${rowPad}`,
      textDecoration: 'none',
      fontSize: rowFont,
      outline: 'none',
      color: theme.palette.text.secondary,
      margin: 0
    },

    '& > a': {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      padding: `0 ${rowPad}`,
      textDecoration: 'none',
      fontSize: rowFont,
      outline: 'none',
      color: theme.palette.text.secondary,

      // Hover ONLY for real mouse
      'html[data-input="mouse"] &': {
        '&:hover': {
          color: activeColor,
          '+ .row-chevron': { transform: 'translateX(-3px)', color: activeColor }
        }
      },

      // Press feedback (mouse + touch) - same as keyboard highlight
      '&:active': {
        color: activeColor,
        '+ .row-chevron': { transform: 'translateX(-3px)', color: activeColor }
      },

      // Keyboard highlight
      '&:focus-visible': {
        color: activeColor,
        '+ .row-chevron': { transform: 'translateX(-3px)', color: activeColor }
      },

      '&:focus': { outline: 'none' }
    }
  }
})

export const StackItem = ({
  children,
  value,
  node,
  showValue,
  withForwardIcon,
  onClick,
  savedLabel,
  focusable,
  ownIcon,
  dimmed,
  disabled
}: StackItemProps) => {
  const { t } = useTranslation()

  const viewValue = node?.valueTransform?.toView ? node?.valueTransform.toView(value) : value

  let displayValue = node?.valueTransform?.format
    ? node.valueTransform.format(viewValue)
    : `${viewValue}${node?.displayValueUnit ?? ''}`

  const settings = useLiviStore((s) => s.settings)
  const numberNode = node?.type === 'number' ? node : undefined
  const unit = numberNode?.unit?.(settings)
  if (numberNode && unit) {
    const step = unit.step ?? numberNode.step ?? 1
    const shown = Math.min(
      Math.round((Number(value) * unit.factor) / step) * step,
      unit.max ?? Number.POSITIVE_INFINITY
    )
    displayValue = `${shown} ${unit.suffix}`
  }

  // gst-device-monitor follow mode bumps this on every device add/remove
  const audioDevicesRevision = useLiviStore((s) => s.audioDevicesRevision)
  const [dynamicOpts, setDynamicOpts] = useState(() =>
    node?.type === 'select' ? getCachedOptions(node as SelectNode) : undefined
  )
  useEffect(() => {
    if (node?.type !== 'select') return
    const sel = node as SelectNode
    if (!sel.loadOptions) return
    let alive = true
    void resolveOptions(sel, { force: true }).then((opts) => {
      if (alive) setDynamicOpts(opts)
    })
    return () => {
      alive = false
    }
  }, [node, audioDevicesRevision])

  if (node?.type === 'select') {
    const sel = node as SelectNode
    const cachedOrFresh = dynamicOpts ?? getCachedOptions(sel)
    const formatOffline = (name: string): string => t('settings.audioDeviceOffline', { name })
    const pickValue = value as string | number | undefined | null

    if (sel.loadOptions && cachedOrFresh === undefined) {
      // Pre-fetch: resolve from static options, else fall back to savedLabel
      const staticHit = sel.options.find((o) => o.value === pickValue)
      if (staticHit) {
        displayValue = staticHit.labelKey ? t(staticHit.labelKey, staticHit.label) : staticHit.label
      } else {
        displayValue = savedLabel ?? ''
      }
    } else {
      const pool = cachedOrFresh ?? sel.options
      const augmented = withGhostOption(pool, pickValue, savedLabel, formatOffline)
      const option = findOptionForValue(augmented, pickValue)
      if (option) {
        const rawLabel = option.labelKey ? t(option.labelKey, option.label) : option.label
        displayValue = option.offline ? formatOffline(rawLabel) : rawLabel
      } else {
        displayValue = ''
      }
    }
  }

  if (displayValue === 'null' || displayValue === 'undefined') {
    displayValue = '---'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick || disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    }
  }

  return (
    <Item
      data-nav-row
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      tabIndex={(onClick && !disabled) || focusable ? 0 : -1}
      role={onClick && !disabled ? 'button' : undefined}
      style={
        dimmed || disabled
          ? { opacity: 0.45, pointerEvents: disabled ? 'none' : undefined }
          : undefined
      }
    >
      {!ownIcon && <SettingsRowIcon name={node?.icon} />}
      {children}
      {showValue && node?.type === 'color' && (
        <div
          style={{
            flex: 'none',
            width: 'clamp(40px, 8svh, 56px)',
            height: 'clamp(20px, 4svh, 28px)',
            borderRadius: 6,
            border: '1px solid rgba(128, 128, 128, 0.5)',
            backgroundColor:
              value != null && String(value).trim() !== ''
                ? String(value)
                : defaultColorForPath(node.path)
          }}
        />
      )}
      {showValue && node?.type !== 'color' && value != null && (
        <div style={{ whiteSpace: 'nowrap', fontSize: 'clamp(0.85rem, 2.0svh, 0.95rem)' }}>
          {displayValue}
        </div>
      )}
      {withForwardIcon && (
        <ArrowForwardIosOutlinedIcon
          className="row-chevron"
          sx={{ color: 'inherit', fontSize: 'clamp(18px, 3.2svh, 28px)' }}
        />
      )}
    </Item>
  )
}
