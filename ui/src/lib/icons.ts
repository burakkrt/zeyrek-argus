/**
 * Uygulamanın tek ikon kaynağı; IMS Cortex'in ikon dilini izler. Menü ikonları Phosphor Duotone (QM modül ikonları
 * `ph-duotone`), menü daraltma Phosphor `sidebar-simple`; arayüz işaretleri (ok, arama, kapat …) Material Symbols
 * Outlined 400. Yalnız burada içe aktarılan SVG pakete girer; yeni ikon önce buraya eklenir, bileşen `Icon` ile çizer.
 */
import brain from '@phosphor-icons/core/assets/duotone/brain-duotone.svg?raw'
import bug from '@phosphor-icons/core/assets/duotone/bug-duotone.svg?raw'
import gear from '@phosphor-icons/core/assets/duotone/gear-duotone.svg?raw'
import playCircle from '@phosphor-icons/core/assets/duotone/play-circle-duotone.svg?raw'
import squaresFour from '@phosphor-icons/core/assets/duotone/squares-four-duotone.svg?raw'
import sidebarSimple from '@phosphor-icons/core/assets/regular/sidebar-simple.svg?raw'
import check from '@material-symbols/svg-400/outlined/check.svg?raw'
import chevronRight from '@material-symbols/svg-400/outlined/chevron_right.svg?raw'
import circle from '@material-symbols/svg-400/outlined/circle.svg?raw'
import close from '@material-symbols/svg-400/outlined/close.svg?raw'
import error from '@material-symbols/svg-400/outlined/error.svg?raw'
import history from '@material-symbols/svg-400/outlined/history.svg?raw'
import inbox from '@material-symbols/svg-400/outlined/inbox.svg?raw'
import keyboardArrowDown from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?raw'
import keyboardArrowUp from '@material-symbols/svg-400/outlined/keyboard_arrow_up.svg?raw'
import leftPanelClose from '@material-symbols/svg-400/outlined/left_panel_close.svg?raw'
import moreHoriz from '@material-symbols/svg-400/outlined/more_horiz.svg?raw'
import remove from '@material-symbols/svg-400/outlined/remove.svg?raw'
import search from '@material-symbols/svg-400/outlined/search.svg?raw'
import unfoldMore from '@material-symbols/svg-400/outlined/unfold_more.svg?raw'
import visibility from '@material-symbols/svg-400/outlined/visibility.svg?raw'

export const icons = {
  brain,
  bug,
  check,
  chevronRight,
  circle,
  close,
  error,
  gear,
  history,
  inbox,
  keyboardArrowDown,
  keyboardArrowUp,
  leftPanelClose,
  moreHoriz,
  playCircle,
  remove,
  search,
  sidebarSimple,
  squaresFour,
  unfoldMore,
  visibility,
}

export type IconName = keyof typeof icons
