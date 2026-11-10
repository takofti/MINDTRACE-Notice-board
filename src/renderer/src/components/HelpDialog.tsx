import { Keyboard, X } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'

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
            <h2>Working the board</h2>
            <p>Everything here is direct. Nothing is moved unless you move it.</p>
          </div>
          <button className="icon-btn close-btn" onClick={close} title="Close">
            <X size={15} />
          </button>
        </div>
        <div className="dialog-body">
          <div className="help-body">
            <div>
              <h3>Board &amp; selection</h3>
              <div className="help-list">
                <HelpRow label="Pan board" keys="Space + drag / Middle drag" />
                <HelpRow label="Zoom" keys="Mouse wheel" />
                <HelpRow label="Marquee select" keys="Drag empty surface" />
                <HelpRow label="Add to selection" keys="Shift + click" />
                <HelpRow label="Quick card" keys="Double-click empty surface" />
                <HelpRow label="Edit card" keys="Double-click card / Enter" />
                <HelpRow label="Add a pin anywhere" keys="Alt + click card" />
                <HelpRow label="Connect" keys="Hover card → drag a pin" />
              </div>
            </div>
            <div>
              <h3>Shortcuts</h3>
              <div className="help-list">
                <HelpRow label="Undo" keys={keybindings.undo} />
                <HelpRow label="Redo" keys={keybindings.redo} />
                <HelpRow label="Search" keys={keybindings.search} />
                <HelpRow label="Copy / paste" keys={`${keybindings.copy} / ${keybindings.paste}`} />
                <HelpRow label="Duplicate" keys={keybindings.duplicate} />
                <HelpRow label="Group" keys={keybindings.group} />
                <HelpRow label="Fit board" keys={keybindings.fitBoard} />
                <HelpRow label="Settings" keys={keybindings.settings} />
              </div>
            </div>
            <div className="help-note">
              <strong style={{ color: 'var(--text-2)' }}>Threads stay out of the way.</strong> Cards always
              sit above threads, connected pins are the only pins visible, and the board simplifies itself
              when you zoom far out. Focus mode dims everything except the chain you are following. You can
              remap every shortcut in Settings → Interaction.
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <div className="left">
            <span className="kbd">Esc</span> closes this panel
          </div>
          <button className="btn" onClick={close}>
            Close
          </button>
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