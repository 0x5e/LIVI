import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography
} from '@mui/material'
import { EMPTY_STRING } from '@renderer/constants'
import { SettingsButtonRow, SettingsSwitchRow, SettingsValueRow } from '@settings/components'
import type { Config } from '@shared/types'
import { coreAction, useLiviStore } from '@store/store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INSTALL_PHASES } from './constants'
import { phaseMap, UpdatePhases, UpgradeText } from './types'
import { buildTag, cmpSemver, human, parseSemver, sameNightlyBuild } from './utils'

const ask = (kind: 'checkUpdate' | 'downloadUpdate' | 'installUpdate' | 'abortUpdate') => {
  coreAction({ kind }).catch((err) => console.warn(`[SoftwareUpdate] ${kind} failed`, err))
}

export function SoftwareUpdate() {
  const { t } = useTranslation()
  const [installedVersion, setInstalledVersion] = useState<string>(EMPTY_STRING)

  const settings = useLiviStore((s) => s.settings) as Config | null
  const saveSettings = useLiviStore((s) => s.saveSettings)
  // Core checks the feed, downloads and installs, the page follows what it publishes.
  const update = useLiviStore((s) => s.update)
  const isNightly = settings?.updateNightly === true
  const installedSha = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : EMPTY_STRING
  const installedRun = typeof __BUILD_RUN__ === 'string' ? __BUILD_RUN__ : EMPTY_STRING

  const latestVersion = update?.latest?.version ?? EMPTY_STRING
  const latestUrl = update?.latest?.url ?? undefined
  const latestCommit = update?.latest?.commit ?? EMPTY_STRING
  const latestRun = update?.latest?.run ?? EMPTY_STRING

  const phase =
    !update || update.phase === 'idle' ? UpdatePhases.start : (update.phase as UpdatePhases)
  const error =
    phase === UpdatePhases.error ? update?.error || t('softwareUpdate.updateFailed') : ''
  const total = update?.total ?? 0
  const received = update?.received ?? 0
  const inFlight = phase !== UpdatePhases.start && phase !== UpdatePhases.error
  const couldNotCheck = update?.checked === true && !update.checking && !latestUrl
  const message = error || (couldNotCheck ? t('softwareUpdate.couldNotCheckLatestRelease') : '')

  const [upDialogOpen, setUpDialogOpen] = useState(false)
  const [installStarting, setInstallStarting] = useState(false)

  const installedSem = parseSemver(installedVersion)
  const latestSem = parseSemver(latestVersion)

  const hasLatest = isNightly ? Boolean(latestUrl) : Boolean(latestUrl && latestSem && installedSem)
  const cmp = !hasLatest
    ? null
    : isNightly
      ? sameNightlyBuild(installedSha, latestCommit)
        ? 0
        : -1
      : cmpSemver(installedSem!, latestSem!)
  const isDowngrade = cmp != null && cmp > 0
  const pct =
    phase === UpdatePhases.download && total > 0 ? Math.round((received / total) * 100) : null
  const phaseText = phaseMap[phase]
  const dialogTitle = isDowngrade ? UpgradeText.downgrade : UpgradeText.upgrade

  const handleClose = useCallback(() => {
    setUpDialogOpen(false)
    setInstallStarting(false)
    if (phase === UpdatePhases.ready) ask('abortUpdate')
  }, [phase])

  const handleRecheckLatest = useCallback(() => ask('checkUpdate'), [])

  const handleNightlyChange = useCallback(
    (_e: unknown, nightly: boolean) => {
      if (!settings || nightly === isNightly) return
      saveSettings({ ...settings, updateNightly: nightly })
    },
    [isNightly, saveSettings, settings]
  )

  useEffect(() => {
    window.app?.getVersion?.().then((v) => v && setInstalledVersion(v))
  }, [])

  // The channel is part of what core asks the feed, a switch asks again.
  useEffect(() => {
    if (settings) handleRecheckLatest()
  }, [handleRecheckLatest, isNightly, settings === null])

  const lastPhase = useRef(phase)
  useEffect(() => {
    if (phase === UpdatePhases.ready && lastPhase.current !== phase) setUpDialogOpen(true)
    lastPhase.current = phase
  }, [phase])

  useEffect(() => {
    if (phase === UpdatePhases.error && /aborted/i.test(error)) {
      const timer = setTimeout(handleClose, 1200)
      return () => clearTimeout(timer)
    }
    return
  }, [phase, error, handleClose])

  const canUpdate = cmp != null && cmp !== 0 && !inFlight
  const updateButtonLabel =
    cmp === 0
      ? t('softwareUpdate.upToDate')
      : isDowngrade
        ? t('softwareUpdate.downgrade')
        : t('softwareUpdate.update')

  const triggerUpdate = useCallback(() => {
    setUpDialogOpen(true)
    setInstallStarting(false)
    ask('downloadUpdate')
  }, [])

  return (
    <>
      <SettingsValueRow
        label={t('softwareUpdate.installedVersion')}
        value={`${installedVersion}${buildTag(installedRun, installedSha)}`}
      />

      <SettingsValueRow
        label={t('softwareUpdate.availableVersion')}
        value={`${latestVersion}${isNightly ? buildTag(latestRun, latestCommit.slice(0, 7)) : ''}`}
      />

      <SettingsSwitchRow
        label={t('softwareUpdate.channelNightly')}
        checked={isNightly}
        disabled={inFlight}
        onChange={handleNightlyChange}
      />

      <SettingsButtonRow
        label={t('softwareUpdate.check')}
        buttonLabel={t('softwareUpdate.refresh')}
        variant="outlined"
        onClick={handleRecheckLatest}
        disabled={inFlight}
      />

      <SettingsButtonRow
        label={t('softwareUpdate.install')}
        buttonLabel={updateButtonLabel}
        onClick={triggerUpdate}
        disabled={!canUpdate}
        loading={inFlight}
      />

      {message && (
        <Typography variant="body2" color={error ? 'error' : 'text.secondary'} sx={{ px: 1 }}>
          {message}
        </Typography>
      )}

      <Dialog
        open={upDialogOpen}
        fullWidth
        maxWidth="xs"
        onClose={(_event, reason) => {
          if (phase !== UpdatePhases.error && reason === 'escapeKeyDown') return
          handleClose()
        }}
      >
        <DialogTitle sx={{ py: 1 }}>{dialogTitle}</DialogTitle>
        <DialogContent sx={{ px: 2, py: 0.5 }}>
          <Typography sx={{ mb: 0.5 }}>{phaseText}</Typography>

          <LinearProgress
            variant={pct != null ? 'determinate' : 'indeterminate'}
            value={pct != null ? pct : undefined}
          />

          {pct != null && (
            <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
              {pct}% • {human(received)} / {human(total)}
            </Typography>
          )}

          {error && (
            <Typography variant="body2" sx={{ mt: 0.5 }} color="error">
              {error}
            </Typography>
          )}

          {INSTALL_PHASES.includes(phase) && (
            <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
              {t('softwareUpdate.restartsAutomaticallyWhenDone')}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button
            onClick={() => ask('abortUpdate')}
            disabled={
              !(phase === UpdatePhases.download ? pct == null || pct < 100 : phase === 'ready')
            }
          >
            {t('softwareUpdate.abort')}
          </Button>

          {phase === UpdatePhases.ready && (
            <Button
              variant="contained"
              disabled={installStarting}
              onClick={() => {
                setInstallStarting(true)
                ask('installUpdate')
              }}
            >
              {t('softwareUpdate.installNow')}
            </Button>
          )}

          {phase === UpdatePhases.error && (
            <Button variant="outlined" onClick={handleClose}>
              {t('softwareUpdate.close')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}
