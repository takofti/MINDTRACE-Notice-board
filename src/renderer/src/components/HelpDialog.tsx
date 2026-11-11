import { Keyboard, X } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { t } from '@/i18n'

export default function HelpDialog(): React.JSX.Element | null {
  const modal = useUi((state) => state.modal)
  const close = useUi((state) => state.closeModal)
  const keybindings = useSettings((state) => state.settings.interaction.keybindings)
  if (modal !== 'help') return null
  return (
    <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && close()}>
      <div className="dialog help-dialog" role="dialog" aria-modal="true">
        <div className="dialog-head">
          <div className="head-icon">
            <Keyboard size={17} />
          </div>
          <div>
            <h2>{t("Working the board")}</h2>
            <p>{t("Everything here is direct. Nothing is moved unless you move it.")}</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title={t("Close")}>
            <X size={15} />
          </button>
        </div>
        <div className="dialog-body">
          <div className="help-body">
            <div>
              <h3>{t("Board & selection")}</h3>
              <div className="help-list">
                <HelpRow label={t("Pan board")} keys={t('Space + drag / Middle drag')} />
                <HelpRow label={t("Zoom")} keys={t('Mouse wheel')} />
                <HelpRow label={t("Marquee select")} keys={t('Drag empty surface')} />
                <HelpRow label={t("Add to selection")} keys={t('Shift + click')} />
                <HelpRow label={t("Quick card")} keys={t('Double-click empty surface')} />
                <HelpRow label={t("Edit card")} keys={t('Double-click card / Enter')} />
                <HelpRow label={t("Add a pin anywhere")} keys={t('Alt + click card')} />
                <HelpRow label={t("Connect")} keys={t('Hover card → drag a pin')} />
              </div>
            </div>
            <div>
              <h3>{t("Shortcuts")}</h3>
              <div className="help-list">
                <HelpRow label={t("Undo")} keys={keybindings.undo} />
                <HelpRow label={t("Redo")} keys={keybindings.redo} />
                <HelpRow label={t("Search")} keys={keybindings.search} />
                <HelpRow label={t("Copy / paste")} keys={`${keybindings.copy} / ${keybindings.paste}`} />
                <HelpRow label={t("Duplicate")} keys={keybindings.duplicate} />
                <HelpRow label={t("Group")} keys={keybindings.group} />
                <HelpRow label={t("Fit board")} keys={keybindings.fitBoard} />
                <HelpRow label={t("Settings")} keys={keybindings.settings} />
              </div>
            </div>
            <div className="help-note">
              <strong style={{ color: 'var(--text-2)' }}>{t("Threads stay out of the way.")}</strong> {t("Cards always sit above threads, connected pins are the only pins visible, and the board simplifies itself when you zoom far out. Focus mode dims everything except the chain you are following. You can remap every shortcut in Settings → Interaction.")}{' '}</div>
          </div>
        </div>
        <div className="dialog-foot">
          <div className="left">
            <span className="kbd">{t("Esc")}</span> {t("closes this panel")}{' '}</div>
          <button className="btn" onClick={close}>
            {t("Close")}{' '}</button>
        </div>
      </div>
    </div>
  )
}

function HelpRow({ label, keys }: { label: string; keys: string }): React.JSX.Element {
  return (
    <div className="help-row">
      <span>{label}</span>
      <span className="kbd">{keys}</span>
    </div>
  )
}