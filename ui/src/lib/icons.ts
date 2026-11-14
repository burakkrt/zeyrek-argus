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
import subject from '@material-symbols/svg-400/outlined/subject.svg?raw'
import circleOutline from '@material-symbols/svg-400/outlined/radio_button_unchecked.svg?raw'
import checkCircle from '@material-symbols/svg-400/outlined/check_circle.svg?raw'
import chevronLeft from '@material-symbols/svg-400/outlined/chevron_left.svg?raw'
import cursor from '@material-symbols/svg-400/outlined/arrow_selector_tool.svg?raw'
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
import play from '@material-symbols/svg-400/outlined/play_arrow.svg?raw'
import pause from '@material-symbols/svg-400/outlined/pause.svg?raw'
import fullscreen from '@material-symbols/svg-400/outlined/fullscreen.svg?raw'
import fullscreenExit from '@material-symbols/svg-400/outlined/fullscreen_exit.svg?raw'
import click from '@material-symbols/svg-400/outlined/ads_click.svg?raw'
import keyboard from '@material-symbols/svg-400/outlined/keyboard.svg?raw'
import scroll from '@material-symbols/svg-400/outlined/swap_vert.svg?raw'
import type from '@material-symbols/svg-400/outlined/edit_note.svg?raw'
import refresh from '@material-symbols/svg-400/outlined/refresh.svg?raw'
import info from '@material-symbols/svg-400/outlined/info.svg?raw'
import arrowBack from '@material-symbols/svg-400/outlined/arrow_back.svg?raw'
import openInNew from '@material-symbols/svg-400/outlined/open_in_new.svg?raw'
import replay from '@material-symbols/svg-400/outlined/replay.svg?raw'
import webAsset from '@material-symbols/svg-400/outlined/web_asset.svg?raw'
import sms from '@material-symbols/svg-400/outlined/sms.svg?raw'
import zoomIn from '@material-symbols/svg-400/outlined/zoom_in.svg?raw'
import link from '@material-symbols/svg-400/outlined/link.svg?raw'
import skipPrevious from '@material-symbols/svg-400/outlined/skip_previous.svg?raw'
import skipNext from '@material-symbols/svg-400/outlined/skip_next.svg?raw'
import psychology from '@material-symbols/svg-400/outlined/psychology.svg?raw'
// Oynatıcı denetimleri tek aileden (Rounded): simetrik, aynı çizgi kalınlığı.
import mediaPlay from '@material-symbols/svg-400/rounded/play_arrow-fill.svg?raw'
import mediaPause from '@material-symbols/svg-400/rounded/pause-fill.svg?raw'
import mediaBack from '@material-symbols/svg-400/rounded/replay_10.svg?raw'
import mediaForward from '@material-symbols/svg-400/rounded/forward_10.svg?raw'
import mediaZoom from '@material-symbols/svg-400/rounded/zoom_in.svg?raw'
import mediaLink from '@material-symbols/svg-400/rounded/link.svg?raw'
import mediaFull from '@material-symbols/svg-400/rounded/fullscreen.svg?raw'
import mediaFullExit from '@material-symbols/svg-400/rounded/fullscreen_exit.svg?raw'
import mediaPrev from '@material-symbols/svg-400/rounded/chevron_left.svg?raw'
import mediaNext from '@material-symbols/svg-400/rounded/chevron_right.svg?raw'

export const icons = {
  subject,
  circleOutline,
  checkCircle,
  chevronLeft,
  cursor,
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
  play,
  pause,
  fullscreen,
  fullscreenExit,
  click,
  keyboard,
  scroll,
  type,
  refresh,
  info,
  arrowBack,
  openInNew,
  replay,
  webAsset,
  sms,
  zoomIn,
  link,
  skipPrevious,
  skipNext,
  psychology,
  mediaPlay,
  mediaPause,
  mediaBack,
  mediaForward,
  mediaZoom,
  mediaLink,
  mediaFull,
  mediaFullExit,
  mediaPrev,
  mediaNext,
}

export type IconName = keyof typeof icons
